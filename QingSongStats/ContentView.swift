import SwiftUI

// MARK: - Models

struct OrderItem: Identifiable {
    let id = UUID()
    let kindLabel: String
    let selection: [Int]
    let stakeCents: Int

    init(_ dict: [String: Any]) {
        kindLabel = dict["kindLabel"] as? String ?? (dict["kind"] as? String ?? "")
        selection = dict["selection"] as? [Int] ?? []
        stakeCents = dict["stakeCents"] as? Int ?? 0
    }
}

struct OrderRecord: Identifiable {
    let id: String
    let market: String
    let person: String
    let totalCents: Int
    let source: String
    let createdAt: String
    let items: [OrderItem]
    let settled: Bool

    init(_ dict: [String: Any]) {
        id = dict["id"] as? String ?? UUID().uuidString
        market = dict["market"] as? String ?? ""
        person = dict["person"] as? String ?? "默认"
        totalCents = dict["totalCents"] as? Int ?? 0
        source = dict["source"] as? String ?? ""
        createdAt = dict["createdAt"] as? String ?? ""
        let raw = dict["items"] as? [[String: Any]] ?? []
        items = raw.map { OrderItem($0) }
        settled = dict["settlement"] != nil
    }
}

struct OrderDetail: Identifiable {
    let id: String
    let record: OrderRecord

    init(_ dict: [String: Any]) {
        let rec = dict["record"] as? [String: Any] ?? [:]
        record = OrderRecord(rec)
        id = record.id
    }
}

struct LedgerData {
    var details: [OrderDetail] = []
    var revision: Int = 0
}

func qssMoney(_ cents: Int) -> String {
    return String(format: "%.2f", Double(cents) / 100.0)
}

func qssDraw(for market: String) -> (special: Int, regular: [Int])? {
    let draws = EngineBridge.shared.loadDraws()
    let key = market == "老澳" ? "老澳门" : market
    guard let entry = draws[key] as? [String: Any],
          let numbers = entry["numbers"] as? [Int], numbers.count >= 7 else { return nil }
    return (numbers[6], Array(numbers[0..<6]))
}

// MARK: - Root

struct ContentView: View {
    @State private var selection = 0

    var body: some View {
        TabView(selection: $selection) {
            EntryView().tabItem { Label("录单", systemImage: "square.and.pencil") }.tag(0)
            LedgerView().tabItem { Label("账本", systemImage: "book.closed") }.tag(1)
            DrawView().tabItem { Label("开奖", systemImage: "gift") }.tag(2)
            RiskView().tabItem { Label("风险", systemImage: "exclamationmark.triangle") }.tag(3)
            SettingsView().tabItem { Label("设置", systemImage: "gearshape") }.tag(4)
        }
        .tint(Color(red: 0, green: 0.66, blue: 0.42))
    }
}

// MARK: - Entry

struct EntryView: View {
    @State private var text = ""
    @State private var result = ""
    @State private var token = ""
    @State private var revision = 0
    @State private var alertText = ""
    @State private var showAlert = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("票据原文").font(.headline)
                        TextEditor(text: $text)
                            .frame(minHeight: 130)
                            .padding(6)
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                        Text("支持多行录入，按地区/玩法自动拆分订单。")
                            .font(.caption).foregroundColor(.secondary)
                    }

                    HStack(spacing: 8) {
                        Button("识别") { recognize(save: false) }
                        Button("识别并录入") { recognize(save: true) }
                        Button("清空") { text = ""; result = ""; token = "" }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0, green: 0.66, blue: 0.42))

                    VStack(alignment: .leading, spacing: 8) {
                        Text("识别结果").font(.headline)
                        Text(result.isEmpty ? "尚未识别" : result)
                            .font(.footnote)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(Color(.systemGray6))
                            .cornerRadius(8)
                    }
                }
                .padding()
            }
            .navigationTitle("票据统计")
            .alert(isPresented: $showAlert) {
                Alert(title: Text("提示"), message: Text(alertText), dismissButton: .default(Text("知道了")))
            }
        }
    }

    func recognize(save: Bool) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            alertText = "请输入票据原文"; showAlert = true; return
        }
        guard let wrapper = EngineBridge.shared.prepare("parse", ["text": text]),
              let parsed = wrapper["result"] as? [String: Any] else {
            alertText = "解析引擎无响应"; showAlert = true; return
        }
        let valid = parsed["valid"] as? Bool ?? false
        if !valid {
            let errors = parsed["errors"] as? [String] ?? []
            alertText = errors.joined(separator: "；").isEmpty ? "识别失败，请检查原文格式" : errors.joined(separator: "；")
            showAlert = true
            return
        }
        token = parsed["token"] as? String ?? ""
        revision = parsed["revision"] as? Int ?? 0
        var lines: [String] = []
        if let items = parsed["items"] as? [[String: Any]] {
            for item in items {
                let label = item["kindLabel"] as? String ?? ""
                let selection = item["selection"] as? [Int] ?? []
                let cents = item["stakeCents"] as? Int ?? 0
                lines.append("\(label) \(selection.map(String.init).joined(separator: "."))  ¥\(qssMoney(cents))")
            }
        }
        result = lines.joined(separator: "\n")
        if save { commitParse() }
    }

    func commitParse() {
        let args: [String: Any] = [
            "text": text,
            "token": token,
            "revision": revision,
            "confirm": true
        ]
        guard let wrapper = EngineBridge.shared.prepare("save", args),
              let next = wrapper["nextState"] as? [String: Any] else {
            alertText = "入账失败：未生成账本事务"; showAlert = true; return
        }
        EngineBridge.shared.commit(next)
        alertText = "已入账"; showAlert = true
        text = ""; result = ""; token = ""
    }
}

// MARK: - Ledger

struct LedgerView: View {
    @State private var data = LedgerData()
    @State private var search = ""
    @State private var selected: OrderDetail?
    @State private var alertText = ""
    @State private var showAlert = false

    var body: some View {
        NavigationView {
            VStack(spacing: 8) {
                HStack {
                    TextField("搜索申报人/订单", text: $search)
                        .textFieldStyle(.roundedBorder)
                    Button("刷新") { load() }
                }
                .padding(.horizontal)

                List {
                    ForEach(filtered) { detail in
                        Button {
                            selected = detail
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Text(detail.record.person).font(.headline)
                                    Spacer()
                                    Text(detail.record.market).font(.caption).foregroundColor(.secondary)
                                }
                                Text("¥\(qssMoney(detail.record.totalCents))")
                                    .font(.subheadline).foregroundColor(.green)
                                Text(detail.record.source)
                                    .font(.caption).foregroundColor(.secondary)
                                    .lineLimit(2)
                            }
                            .padding(.vertical, 2)
                        }
                    }
                    .onDelete { indexSet in
                        if let first = indexSet.first, first < filtered.count {
                            deleteRecord(filtered[first])
                        }
                    }
                }
                .listStyle(.plain)
            }
            .navigationTitle("账本")
            .onAppear { load() }
            .sheet(item: $selected) { detail in
                OrderDetailView(detail: detail) { load() }
            }
            .alert(isPresented: $showAlert) {
                Alert(title: Text("提示"), message: Text(alertText), dismissButton: .default(Text("知道了")))
            }
        }
    }

    var filtered: [OrderDetail] {
        let key = search.trimmingCharacters(in: .whitespaces)
        guard !key.isEmpty else { return data.details }
        return data.details.filter {
            $0.record.person.contains(key) || $0.record.source.contains(key) || $0.record.market.contains(key)
        }
    }

    func load() {
        guard let wrapper = EngineBridge.shared.prepare("orderPageSnapshot", ["webPayload": true]),
              let result = wrapper["result"] as? [String: Any],
              let payload = result["webPayload"] as? String,
              let jsonData = payload.data(using: .utf8),
              let root = (try? JSONSerialization.jsonObject(with: jsonData, options: [])) as? [String: Any] else { return }
        let rawDetails = root["details"] as? [[String: Any]] ?? []
        data.details = rawDetails.map { OrderDetail($0) }
        data.revision = root["revision"] as? Int ?? 0
    }

    func deleteRecord(_ detail: OrderDetail) {
        let args: [String: Any] = [
            "confirm": true,
            "revision": EngineBridge.shared.revision(),
            "market": detail.record.market,
            "ids": [detail.record.id]
        ]
        guard let wrapper = EngineBridge.shared.prepare("deleteOrders", args),
              let next = wrapper["nextState"] as? [String: Any] else { return }
        EngineBridge.shared.commit(next)
        alertText = "已删除订单"; showAlert = true
        load()
    }
}

struct OrderDetailView: View {
    let detail: OrderDetail
    let onChanged: () -> Void
    @Environment(\.presentationMode) var presentationMode
    @State private var alertText = ""
    @State private var showAlert = false

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(detail.record.person).font(.title3.bold())
                        Text("\(detail.record.market) · \(detail.record.createdAt)")
                            .font(.caption).foregroundColor(.secondary)
                        Text(detail.record.source)
                            .font(.footnote)
                            .padding()
                            .background(Color(.systemGray6)).cornerRadius(8)
                    }
                    ForEach(detail.record.items) { item in
                        HStack {
                            Text(item.kindLabel)
                            Text(item.selection.map(String.init).joined(separator: "."))
                                .foregroundColor(.secondary)
                            Spacer()
                            Text("¥\(qssMoney(item.stakeCents))")
                        }
                        .font(.subheadline)
                        .padding(.vertical, 4)
                    }
                    HStack {
                        Text("合计").font(.headline)
                        Spacer()
                        Text("¥\(qssMoney(detail.record.totalCents))")
                            .font(.headline).foregroundColor(.green)
                    }
                    Button(detail.record.settled ? "已兑奖" : "兑奖") { settle() }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0, green: 0.66, blue: 0.42))
                        .disabled(detail.record.settled)
                }
                .padding()
            }
            .navigationTitle("订单详情")
            .navigationBarItems(trailing: Button("关闭") { presentationMode.wrappedValue.dismiss() })
            .alert(isPresented: $showAlert) {
                Alert(title: Text("提示"), message: Text(alertText), dismissButton: .default(Text("知道了")))
            }
        }
    }

    func settle() {
        guard let draw = qssDraw(for: detail.record.market) else {
            alertText = "请先在「开奖」页录入 \(detail.record.market) 的 7 个开奖号码"; showAlert = true; return
        }
        let args: [String: Any] = [
            "confirm": true,
            "revision": EngineBridge.shared.revision(),
            "market": detail.record.market,
            "recordIds": [detail.record.id],
            "special": draw.special,
            "regular": draw.regular,
            "includeSettlementReport": false
        ]
        guard let wrapper = EngineBridge.shared.prepare("settle", args),
              let next = wrapper["nextState"] as? [String: Any] else {
            alertText = "兑奖失败"; showAlert = true; return
        }
        EngineBridge.shared.commit(next)
        alertText = "兑奖完成"; showAlert = true
        onChanged()
    }
}

// MARK: - Draw

struct DrawView: View {
    @State private var region = 0
    @State private var numbers: [String] = Array(repeating: "", count: 7)
    @State private var alertText = ""
    @State private var showAlert = false
    let regions = ["新澳", "香港", "老澳"]

    var body: some View {
        NavigationView {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Picker("地区", selection: $region) {
                        ForEach(0..<regions.count, id: \.self) { Text(regions[$0]) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: region) { _ in loadNumbers() }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("平码 1–6").font(.headline)
                        HStack {
                            ForEach(0..<6, id: \.self) { i in
                                TextField("-", text: $numbers[i])
                                    .keyboardType(.numberPad)
                                    .textFieldStyle(.roundedBorder)
                                    .frame(width: 44)
                            }
                        }
                        Text("特码").font(.headline)
                        TextField("-", text: $numbers[6])
                            .keyboardType(.numberPad)
                            .textFieldStyle(.roundedBorder)
                            .frame(width: 60)
                    }

                    HStack(spacing: 8) {
                        Button("保存开奖号码") { saveNumbers() }
                        Button("清空") { numbers = Array(repeating: "", count: 7) }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0, green: 0.66, blue: 0.42))

                    Text("开奖号码保存在本机，兑奖时由原生引擎读取。")
                        .font(.caption).foregroundColor(.secondary)
                }
                .padding()
            }
            .navigationTitle("开奖号码")
            .onAppear { loadNumbers() }
            .alert(isPresented: $showAlert) {
                Alert(title: Text("提示"), message: Text(alertText), dismissButton: .default(Text("知道了")))
            }
        }
    }

    func loadNumbers() {
        let draws = EngineBridge.shared.loadDraws()
        let key = regions[region] == "老澳" ? "老澳门" : regions[region]
        guard let entry = draws[key] as? [String: Any],
              let values = entry["numbers"] as? [Int] else {
            numbers = Array(repeating: "", count: 7)
            return
        }
        numbers = values.prefix(7).map(String.init) + Array(repeating: "", count: max(0, 7 - values.count))
    }

    func saveNumbers() {
        let values = numbers.compactMap { Int($0.trimmingCharacters(in: .whitespaces)) }
        guard values.count == 7 else {
            alertText = "请完整填写 6 个平码和 1 个特码"; showAlert = true; return
        }
        var draws = EngineBridge.shared.loadDraws()
        let key = regions[region] == "老澳" ? "老澳门" : regions[region]
        draws[key] = ["period": "手动", "numbers": values]
        EngineBridge.shared.saveDraws(draws)
        alertText = "已保存 \(regions[region]) 开奖号码"; showAlert = true
    }
}

// MARK: - Risk / Settings

struct RiskView: View {
    @State private var text = ""
    @State private var alertText = ""
    @State private var showAlert = false

    var body: some View {
        NavigationView {
            VStack(spacing: 14) {
                TextEditor(text: $text)
                    .frame(minHeight: 200)
                    .padding(6)
                    .background(Color(.systemGray6)).cornerRadius(8)
                Button("查看风险") { inspect() }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0, green: 0.66, blue: 0.42))
                Text(alertText)
                    .font(.footnote).foregroundColor(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding()
            .navigationTitle("风险")
        }
    }

    func inspect() {
        guard !text.isEmpty else { alertText = "请输入票据原文"; return }
        guard let wrapper = EngineBridge.shared.prepare("parse", ["text": text]),
              let parsed = wrapper["result"] as? [String: Any] else { return }
        let count = (parsed["itemCount"] as? Int) ?? 0
        let cents = (parsed["totalCents"] as? Int) ?? 0
        alertText = "共 \(count) 注，合计 ¥\(qssMoney(cents))"
    }
}

struct SettingsView: View {
    @State private var alertText = ""

    var body: some View {
        NavigationView {
            List {
                Section("账本") {
                    Button("导出账本 JSON") { exportBook() }
                    Button("重置账本") { resetBook() }
                }
                Section("关于") {
                    HStack { Text("版本"); Spacer(); Text("5.07 (iOS 16 原生重建)").foregroundColor(.secondary) }
                    HStack { Text("引擎"); Spacer(); Text("JavaScriptCore + 原版规则引擎").foregroundColor(.secondary) }
                }
            }
            .navigationTitle("设置")
        }
    }

    func exportBook() {
        UIPasteboard.general.string = EngineBridge.shared.preparedBook()
        alertText = "账本 JSON 已复制到剪贴板"
    }

    func resetBook() {
        EngineBridge.shared.resetBook()
        alertText = "账本已重置"
    }
}
