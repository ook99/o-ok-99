import Foundation
import JavaScriptCore

final class EngineBridge {
    static let shared = EngineBridge()

    private let context = JSContext()
    private let bookKey = "qingsong.book.v1"
    private let drawsKey = "qingsong.draws.v1"
    private var storage: [String: String] = [:]

    private init() {
        context?.exceptionHandler = { _, error in
            NSLog("QSS JS error: %@", error?.toString() ?? "unknown")
        }

        let persist: @convention(block) (String, String) -> Void = { [weak self] key, value in
            self?.storage[key] = value
            UserDefaults.standard.set(value, forKey: key)
        }
        let load: @convention(block) (String) -> String? = { [weak self] key in
            return self?.storage[key]
        }
        context?.setObject(persist, forKeyedSubscript: "__qssPersist" as NSString)
        context?.setObject(load, forKeyedSubscript: "__qssLoad" as NSString)

        for (key, value) in UserDefaults.standard.dictionaryRepresentation() {
            if let text = value as? String, key.hasPrefix("qingsong.") {
                storage[key] = text
            }
        }

        context?.evaluateScript("""
        var window = this;
        var global = this;
        var localStorage = {
          getItem: function(k){ var v = __qssLoad(k); return v === undefined ? null : v; },
          setItem: function(k,v){ __qssPersist(k, String(v)); },
          removeItem: function(k){ __qssPersist(k, ''); }
        };
        var document = {
          getElementById: function(){ return null; },
          createElement: function(){ return { style:{}, appendChild:function(){}, remove:function(){} }; },
          body: { appendChild: function(){} }
        };
        var navigator = {};
        var prompt = function(){ return null; };
        """)

        for name in ["core", "wisdom-rules", "wisdom-engine", "wisdom-parser", "offload", "native-api"] {
            guard let url = Bundle.main.url(forResource: name, withExtension: "js", subdirectory: "Engine"),
                  var code = try? String(contentsOf: url, encoding: .utf8) else { continue }
            code = code.replacingOccurrences(of: "\u{0000}", with: "\\x00")
                       .replacingOccurrences(of: "\u{0019}", with: "\\x19")
            context?.evaluateScript(code)
        }

        if storage[bookKey] == nil {
            let fresh = context?.evaluateScript("JSON.stringify(NativeApi.freshBook())")?.toString() ?? "{}"
            storage[bookKey] = fresh
            UserDefaults.standard.set(fresh, forKey: bookKey)
        }
        if let raw = storage[bookKey] {
            let escaped = escapeForJS(raw)
            context?.evaluateScript("NativeApi.initialize('\(escaped)')")
        }
    }

    private func escapeForJS(_ text: String) -> String {
        return text.replacingOccurrences(of: "\\", with: "\\\\")
                   .replacingOccurrences(of: "'", with: "\\'")
                   .replacingOccurrences(of: "\n", with: "\\n")
                   .replacingOccurrences(of: "\r", with: "\\r")
    }

    func revision() -> Int {
        guard let object = prepare("revision", [:]),
              let result = object["result"] as? [String: Any],
              let value = result["revision"] as? Int else { return 0 }
        return value
    }

    func prepare(_ action: String, _ args: [String: Any] = [:]) -> [String: Any]? {
        guard let data = try? JSONSerialization.data(withJSONObject: args, options: []),
              let json = String(data: data, encoding: .utf8) else { return nil }
        let script = "JSON.stringify(NativeApi.prepare('\(action)', \(json)))"
        guard let output = context?.evaluateScript(script)?.toString(),
              let outData = output.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: outData, options: [])) as? [String: Any] else { return nil }
        return object
    }

    func commit(_ nextState: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: nextState, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        guard let serialized = context?.evaluateScript("NativeApi.serializePending(\(json))")?.toString() else { return }
        storage[bookKey] = serialized
        UserDefaults.standard.set(serialized, forKey: bookKey)
        context?.evaluateScript("NativeApi.commit(\(json))")
    }

    func saveDraws(_ draws: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: draws, options: []),
              let json = String(data: data, encoding: .utf8) else { return }
        storage[drawsKey] = json
        UserDefaults.standard.set(json, forKey: drawsKey)
    }

    func loadDraws() -> [String: Any] {
        guard let raw = storage[drawsKey], let data = raw.data(using: .utf8),
              let object = (try? JSONSerialization.jsonObject(with: data, options: [])) as? [String: Any] else { return [:] }
        return object
    }

    func clearDraws() {
        storage[drawsKey] = nil
        UserDefaults.standard.removeObject(forKey: drawsKey)
    }

    func preparedBook() -> String {
        return storage[bookKey] ?? "{}"
    }

    func resetBook() {
        let fresh = context?.evaluateScript("JSON.stringify(NativeApi.freshBook())")?.toString() ?? "{}"
        storage[bookKey] = fresh
        UserDefaults.standard.set(fresh, forKey: bookKey)
        context?.evaluateScript("NativeApi.initialize('\(escapeForJS(fresh))')")
    }
}
