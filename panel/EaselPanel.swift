// EaselPanel.swift
// Thin native shell: an NSPanel hosting a WKWebView pointed at the easel
// server's /panel route, a global hotkey to toggle it, and a corner toast
// fed by the server's /events SSE stream. All navigation/UI logic lives in
// the web app; this file only owns windows, the hotkey, and the SSE feed.
//
// Built with `swiftc` only (see build.sh). No Xcode project.

import Cocoa
import WebKit
import Carbon.HIToolbox

// MARK: - Config

enum Config {
    static let port: Int = {
        if let env = ProcessInfo.processInfo.environment["EASEL_PORT"], let p = Int(env) {
            return p
        }
        return 7878
    }()

    static let panelURL = URL(string: "http://localhost:\(port)/panel")!
    static let eventsURL = URL(string: "http://127.0.0.1:\(port)/events")!

    /// Reads optional `panel.hotkey` from ~/.easel/config.json, e.g. "ctrl+option+space".
    static func hotkeyString() -> String {
        let path = (NSHomeDirectory() as NSString).appendingPathComponent(".easel/config.json")
        guard let data = FileManager.default.contents(atPath: path) else {
            return "ctrl+option+space"
        }
        guard
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let panel = obj["panel"] as? [String: Any],
            let hotkey = panel["hotkey"] as? String,
            !hotkey.isEmpty
        else {
            return "ctrl+option+space"
        }
        return hotkey
    }
}

// MARK: - Hotkey parsing (Carbon modifiers + virtual keycodes)

enum HotkeySpec {
    static func parse(_ s: String) -> (modifiers: UInt32, keyCode: UInt32)? {
        let parts = s.lowercased().split(separator: "+").map(String.init)
        guard !parts.isEmpty else { return nil }

        var mods: UInt32 = 0
        var keyPart: String?

        for part in parts {
            switch part {
            case "ctrl", "control":
                mods |= UInt32(controlKey)
            case "option", "alt":
                mods |= UInt32(optionKey)
            case "cmd", "command":
                mods |= UInt32(cmdKey)
            case "shift":
                mods |= UInt32(shiftKey)
            default:
                keyPart = part
            }
        }

        guard let key = keyPart, let code = virtualKeyCode(for: key) else {
            return nil
        }
        return (mods, code)
    }

    private static func virtualKeyCode(for key: String) -> UInt32? {
        if key == "space" {
            return UInt32(kVK_Space)
        }
        let letters: [String: Int] = [
            "a": kVK_ANSI_A, "b": kVK_ANSI_B, "c": kVK_ANSI_C, "d": kVK_ANSI_D,
            "e": kVK_ANSI_E, "f": kVK_ANSI_F, "g": kVK_ANSI_G, "h": kVK_ANSI_H,
            "i": kVK_ANSI_I, "j": kVK_ANSI_J, "k": kVK_ANSI_K, "l": kVK_ANSI_L,
            "m": kVK_ANSI_M, "n": kVK_ANSI_N, "o": kVK_ANSI_O, "p": kVK_ANSI_P,
            "q": kVK_ANSI_Q, "r": kVK_ANSI_R, "s": kVK_ANSI_S, "t": kVK_ANSI_T,
            "u": kVK_ANSI_U, "v": kVK_ANSI_V, "w": kVK_ANSI_W, "x": kVK_ANSI_X,
            "y": kVK_ANSI_Y, "z": kVK_ANSI_Z,
        ]
        if key.count == 1, let code = letters[key] {
            return UInt32(code)
        }
        return nil
    }
}

// MARK: - Main panel (can become key)

final class EaselMainPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

// MARK: - Toast panel (never takes keyboard)

final class ToastPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }
}

/// Simple click-through view that reports mouseDown to a closure.
final class ClickableView: NSView {
    var onClick: (() -> Void)?
    override func mouseDown(with event: NSEvent) {
        onClick?()
    }
}

// MARK: - Toast manager

struct WalkEvent {
    let project: String
    let walkId: String
    let title: String
    let label: String?
}

final class ToastManager {
    private let toastWidth: CGFloat = 360
    private let toastHeight: CGFloat = 72
    private let margin: CGFloat = 16
    private let gap: CGFloat = 8
    private let maxVisible = 3

    private var slots: [ToastPanel?] = [nil, nil, nil]
    private var overflowCount = 0
    private var overflowPanel: ToastPanel?
    private var hideWorkItems: [ObjectIdentifier: DispatchWorkItem] = [:]

    var onSelect: ((WalkEvent) -> Void)?

    func show(_ event: WalkEvent) {
        if let emptyIndex = slots.firstIndex(where: { $0 == nil }) {
            let panel = makeToastPanel(event: event)
            slots[emptyIndex] = panel
            layout()
            panel.orderFront(nil)
            scheduleHide(for: panel, slotIndex: emptyIndex)
            return
        }

        // All real slots full: collapse into (or bump) the overflow toast.
        overflowCount += 1
        if let existing = overflowPanel {
            updateOverflowLabel(existing)
        } else {
            let panel = makeOverflowPanel()
            overflowPanel = panel
            layout()
            panel.orderFront(nil)
        }
    }

    private func makeToastPanel(event: WalkEvent) -> ToastPanel {
        let panel = ToastPanel(
            contentRect: NSRect(x: 0, y: 0, width: toastWidth, height: toastHeight),
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true

        let content = ClickableView(frame: NSRect(x: 0, y: 0, width: toastWidth, height: toastHeight))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.98).cgColor
        content.layer?.cornerRadius = 10

        let titleLabel = NSTextField(labelWithString: "New walk")
        titleLabel.font = .boldSystemFont(ofSize: 13)
        titleLabel.frame = NSRect(x: 14, y: 40, width: toastWidth - 28, height: 18)

        let subtitleLabel = NSTextField(labelWithString: "\(event.label ?? event.project) \u{b7} \(event.title)")
        subtitleLabel.font = .systemFont(ofSize: 12)
        subtitleLabel.textColor = .secondaryLabelColor
        subtitleLabel.lineBreakMode = .byTruncatingTail
        subtitleLabel.frame = NSRect(x: 14, y: 16, width: toastWidth - 28, height: 18)

        content.addSubview(titleLabel)
        content.addSubview(subtitleLabel)
        content.onClick = { [weak self] in self?.select(event) }

        panel.contentView = content
        return panel
    }

    private func makeOverflowPanel() -> ToastPanel {
        let panel = ToastPanel(
            contentRect: NSRect(x: 0, y: 0, width: toastWidth, height: toastHeight),
            styleMask: [.nonactivatingPanel, .borderless],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true

        let content = NSView(frame: NSRect(x: 0, y: 0, width: toastWidth, height: toastHeight))
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor.windowBackgroundColor.withAlphaComponent(0.98).cgColor
        content.layer?.cornerRadius = 10

        let label = NSTextField(labelWithString: "+\(overflowCount) more")
        label.font = .boldSystemFont(ofSize: 13)
        label.frame = NSRect(x: 14, y: 27, width: toastWidth - 28, height: 18)
        label.identifier = NSUserInterfaceItemIdentifier("overflowLabel")

        content.addSubview(label)
        panel.contentView = content
        return panel
    }

    private func updateOverflowLabel(_ panel: ToastPanel) {
        if let label = panel.contentView?.subviews.first(where: {
            $0.identifier == NSUserInterfaceItemIdentifier("overflowLabel")
        }) as? NSTextField {
            label.stringValue = "+\(overflowCount) more"
        }
    }

    private func select(_ event: WalkEvent) {
        onSelect?(event)
    }

    private func scheduleHide(for panel: ToastPanel, slotIndex: Int) {
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            panel.orderOut(nil)
            if slotIndex < self.slots.count, self.slots[slotIndex] === panel {
                self.slots[slotIndex] = nil
            }
            self.hideWorkItems[ObjectIdentifier(panel)] = nil
            self.promoteOverflowIfNeeded()
            self.layout()
        }
        hideWorkItems[ObjectIdentifier(panel)] = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    /// When a real slot frees up, pull the overflow toast into it.
    private func promoteOverflowIfNeeded() {
        guard overflowPanel != nil, let freeIndex = slots.firstIndex(where: { $0 == nil }) else {
            return
        }
        // Overflow stays as its own summary toast but moves into the freed slot.
        slots[freeIndex] = overflowPanel
    }

    private func layout() {
        guard let screen = NSScreen.main else { return }
        let visible = screen.visibleFrame
        var y = visible.maxY - margin - toastHeight
        let x = visible.maxX - margin - toastWidth

        for slot in slots {
            guard let panel = slot else { continue }
            panel.setFrame(NSRect(x: x, y: y, width: toastWidth, height: toastHeight), display: true)
            y -= (toastHeight + gap)
        }
        if let overflow = overflowPanel, !slots.contains(where: { $0 === overflow }) {
            overflow.setFrame(NSRect(x: x, y: y, width: toastWidth, height: toastHeight), display: true)
        }
    }
}

// MARK: - SSE client

final class EventStream: NSObject, URLSessionDataDelegate {
    private var session: URLSession!
    private var task: URLSessionDataTask?
    private var buffer = Data()
    private var backoff: TimeInterval = 1
    private let maxBackoff: TimeInterval = 30
    var onWalkEvent: ((WalkEvent) -> Void)?

    func start() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = .infinity
        config.timeoutIntervalForResource = .infinity
        session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
        connect()
    }

    private func connect() {
        buffer.removeAll()
        var request = URLRequest(url: Config.eventsURL)
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        task = session.dataTask(with: request)
        task?.resume()
        FileHandle.standardError.write("[EaselPanel] connecting to \(Config.eventsURL)\n".data(using: .utf8)!)
    }

    private func reconnectAfterDelay() {
        let delay = backoff
        backoff = min(backoff * 2, maxBackoff)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            self?.connect()
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        buffer.append(data)
        while let range = buffer.range(of: Data("\n\n".utf8)) {
            let chunk = buffer.subdata(in: buffer.startIndex..<range.lowerBound)
            buffer.removeSubrange(buffer.startIndex..<range.upperBound)
            parseEvent(chunk)
        }
        // Successful data means the connection is healthy; reset backoff.
        backoff = 1
    }

    private func parseEvent(_ chunk: Data) {
        guard let text = String(data: chunk, encoding: .utf8) else { return }
        var eventName = "message"
        var dataLines: [String] = []
        for line in text.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix("event:") {
                eventName = line.dropFirst(6).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5).trimmingCharacters(in: .whitespaces)))
            }
        }
        guard eventName == "walk" else { return }
        let payload = dataLines.joined(separator: "\n")
        guard
            let data = payload.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let project = obj["project"] as? String,
            let walkId = obj["walkId"] as? String,
            let title = obj["title"] as? String
        else {
            return
        }
        let label = obj["label"] as? String
        let event = WalkEvent(project: project, walkId: walkId, title: title, label: label)
        DispatchQueue.main.async { [weak self] in
            self?.onWalkEvent?(event)
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        FileHandle.standardError.write(
            "[EaselPanel] /events stream closed (\(error?.localizedDescription ?? "eof")), reconnecting in \(backoff)s\n"
                .data(using: .utf8)!
        )
        reconnectAfterDelay()
    }
}

// MARK: - Web bridge

final class PanelBridge: NSObject, WKScriptMessageHandler {
    weak var appDelegate: AppDelegate?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard
            let body = message.body as? [String: Any],
            let type = body["type"] as? String
        else {
            return
        }
        switch type {
        case "hide":
            appDelegate?.hidePanel()
        case "navigate":
            if let path = body["path"] as? String {
                appDelegate?.navigate(to: path)
            }
        default:
            break
        }
    }
}

// MARK: - Web view navigation policy

/// Keeps the panel's WKWebView locked to the local easel server: main-frame
/// navigations must stay on localhost/127.0.0.1 at the configured port,
/// subframe navigations may only be about:srcdoc/about:blank. External links
/// (window.open) are handed to the default browser instead of loaded in-panel.
final class PanelWebViewPolicy: NSObject, WKNavigationDelegate, WKUIDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }

        if navigationAction.targetFrame?.isMainFrame == true {
            if url.host == "localhost" || url.host == "127.0.0.1", url.port == Config.port {
                decisionHandler(.allow)
            } else {
                decisionHandler(.cancel)
            }
            return
        }

        // Subframe: only allow inert content, never a live navigation.
        if url.absoluteString == "about:srcdoc" || url.absoluteString == "about:blank" {
            decisionHandler(.allow)
        } else {
            decisionHandler(.cancel)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(),
            scheme == "http" || scheme == "https"
        {
            NSWorkspace.shared.open(url)
        }
        return nil
    }
}

// MARK: - App delegate

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: EaselMainPanel!
    private var webView: WKWebView!
    private var bridge = PanelBridge()
    private var webViewPolicy = PanelWebViewPolicy()
    private var eventStream = EventStream()
    private var toastManager = ToastManager()
    private var hotKeyRef: EventHotKeyRef?
    private var previousFrontmostApp: NSRunningApplication?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)

        guard checkSingleInstance() else {
            FileHandle.standardError.write("[EaselPanel] another instance is already running, exiting\n".data(using: .utf8)!)
            NSApp.terminate(nil)
            return
        }

        setupPanel()
        setupToastManager()
        registerHotkey()
        eventStream.onWalkEvent = { [weak self] event in
            self?.toastManager.show(event)
        }
        eventStream.start()
    }

    // MARK: single instance

    private func checkSingleInstance() -> Bool {
        guard let bundleId = Bundle.main.bundleIdentifier else { return true }
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        let others = running.filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
        return others.isEmpty
    }

    // MARK: main panel

    private func setupPanel() {
        let contentController = WKUserContentController()
        contentController.add(bridge, name: "easel")
        bridge.appDelegate = self

        let config = WKWebViewConfiguration()
        config.userContentController = contentController

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = webViewPolicy
        webView.uiDelegate = webViewPolicy
        webView.load(URLRequest(url: Config.panelURL))

        panel = EaselMainPanel(
            contentRect: defaultFrame(),
            styleMask: [.nonactivatingPanel, .titled, .resizable, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true
        panel.contentView = webView

        if !panel.setFrameUsingName("EaselPanel") {
            panel.setFrame(defaultFrame(), display: false)
        }
        panel.setFrameAutosaveName("EaselPanel")
    }

    private func defaultFrame() -> NSRect {
        guard let screen = NSScreen.main else {
            return NSRect(x: 0, y: 0, width: 480, height: 800)
        }
        let visible = screen.visibleFrame
        let width = visible.width * 0.4
        return NSRect(x: visible.maxX - width, y: visible.minY, width: width, height: visible.height)
    }

    private func setupToastManager() {
        toastManager.onSelect = { [weak self] event in
            self?.openWalk(event)
        }
    }

    // MARK: panel visibility

    func showPanel() {
        previousFrontmostApp = NSWorkspace.shared.frontmostApplication
        panel.orderFrontRegardless()
        panel.makeKey()
    }

    func hidePanel() {
        panel.orderOut(nil)
        if let app = previousFrontmostApp {
            app.activate(options: [])
        }
    }

    func togglePanel() {
        if panel.isVisible {
            hidePanel()
        } else {
            showPanel()
        }
    }

    func navigate(to path: String) {
        // Only accept a bare path under /panel: no scheme, no "//" (which
        // URL(string:relativeTo:) can resolve as an absolute/protocol-relative
        // URL and let a malicious page escape the local panel origin).
        guard
            path.hasPrefix("/panel"),
            !path.hasPrefix("//"),
            !path.contains("://")
        else {
            return
        }
        guard let url = URL(string: "http://localhost:\(Config.port)\(path)") else { return }
        webView.load(URLRequest(url: url))
    }

    private func openWalk(_ event: WalkEvent) {
        navigate(to: "/panel/w/\(event.walkId)")
        showPanel()
    }

    // MARK: hotkey

    private func registerHotkey() {
        guard let spec = HotkeySpec.parse(Config.hotkeyString()) else {
            FileHandle.standardError.write("[EaselPanel] could not parse panel.hotkey, hotkey disabled\n".data(using: .utf8)!)
            return
        }

        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: OSType(kEventHotKeyPressed))
        InstallEventHandler(
            GetApplicationEventTarget(),
            { _, eventRef, userData in
                guard let userData else { return noErr }
                let delegate = Unmanaged<AppDelegate>.fromOpaque(userData).takeUnretainedValue()
                delegate.togglePanel()
                return noErr
            },
            1,
            &eventType,
            Unmanaged.passUnretained(self).toOpaque(),
            nil
        )

        let hotKeyID = EventHotKeyID(signature: OSType(0x4553504c /* 'ESPL' */), id: 1)
        let status = RegisterEventHotKey(spec.keyCode, spec.modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
        if status == noErr {
            FileHandle.standardError.write("[EaselPanel] hotkey registered: noErr\n".data(using: .utf8)!)
        } else {
            FileHandle.standardError.write("[EaselPanel] hotkey registration failed: \(status)\n".data(using: .utf8)!)
        }
    }
}

// MARK: - Entry point

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
