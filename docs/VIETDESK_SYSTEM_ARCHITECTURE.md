# BẢN THIẾT KẾ HỆ THỐNG & TOÀN BỘ CÁC LUỒNG LOGIC (SYSTEM & LOGIC FLOWS BLUEPRINT)
**Dự án: VietDesk Office Suite**  
*Mục tiêu tài liệu: Mô tả 100% sơ đồ hệ thống, cấu trúc các khối và các luồng đi logic (Logic Flows) từ Cơ bản đến Cửa cuối mà không dùng code lập trình.*

---

## MỤC LỤC TỔNG THỂ
1. **Sơ đồ Phân rã Khối Chức năng Hệ thống (Functional Block Diagram)**
2. **Nhóm Luồng Tầng 1: Native Desktop & Vòng đời Dữ liệu Cục bộ (Basic)**
   * *Luồng 1.1: Khởi động, Đọc đĩa & Phục hồi sự cố (Crash Recovery)*
   * *Luồng 1.2: Đánh chặn Clipboard & Chuyển mã tự động (WASM Pipeline)*
   * *Luồng 1.3: Ghi đĩa nguyên tử (Atomic Local Save)*
3. **Nhóm Luồng Tầng 2: Hành chính NĐ30, OOXML & Bảng tính (Pro)**
   * *Luồng 2.1: Phân trang ảo và Dồn trang A4 thời gian thực (Virtual Pagination Logic)*
   * *Luồng 2.2: Chuyển đổi hai chiều OOXML (.docx/.xlsx Round-Trip)*
   * *Luồng 2.3: Ký số điện tử PKCS#11 & Niêm phong tài liệu NĐ30*
   * *Luồng 2.4: Bảng tính Kế toán, Đọc số tiền & Căn chỉnh vùng in ấn*
4. **Nhóm Luồng Tầng 3: Điện toán Đám mây, Cộng tác & Bảo mật (Ultimate)**
   * *Luồng 3.1: Đồng bộ thời gian thực CRDT & Xử lý đa điểm (Multi-user Sync)*
   * *Luồng 3.2: Rớt mạng ngoại tuyến & Đồng bộ bù (Offline Catch-Up)*
   * *Luồng 3.3: Lịch sử phiên bản & Time-Machine Rollback*
   * *Luồng 3.4: Bảo mật DLP, Watermark động & Phân quyền hạt nhân*
5. **Nhóm Luồng Tầng 4: Hệ điều hành Văn phòng Tự trị (Cửa Cuối - Agentic Loop)**
   * *Luồng 4.1: Tiếp nhận mục tiêu, Lập kế hoạch & Phân rã tác vụ (Goal Planning)*
   * *Luồng 4.2: Tương tác cây AST & Thẩm định thể thức NĐ30 tự động*
   * *Luồng 4.3: Đồng bộ dữ liệu chéo đa tài liệu (Word - Excel - Slide)*
   * *Luồng 4.4: Kiểm duyệt con người & Ban hành tự động (Human-in-the-Loop)*

---

# 1. SƠ ĐỒ PHÂN RÃ KHỐI CHỨC NĂNG HỆ THỐNG

```mermaid
graph TB
    subgraph UI_HOST ["1. GIAO DIỆN & VỎ BỌC (DESKTOP & WEB HOST)"]
        TabManager["Bộ Quản lý Tab Workspace"]
        RibbonBar["Thanh Ribbon Theo Ngữ cảnh"]
        CanvasViewport["Khung Hiển thị Trang (A4 Canvas Viewport)"]
    end

    subgraph ENGINE_CORE ["2. BỘ NÃO SOẠN THẢO (EDITING ENGINES)"]
        WriterCore["Writer Engine (Cây ProseMirror AST)"]
        PagingEngine["Virtual Pagination Engine (Bộ Tính Chiều cao & Ngắt Trang)"]
        SheetsCore["Sheets Engine (Cây Univer AST & Canvas Grid)"]
        FormulaEngine["Bộ Tính Công thức & Ngôn ngữ Kế toán VN"]
    end

    subgraph LOCAL_PIPELINE ["3. XỬ LÝ NỘI BỘ OFFLINE (WASM & NATIVE)"]
        ClipboardInterceptor["Bộ Đánh chặn Clipboard Hệ điều hành"]
        CharsetDecoder["WASM Bảng mã (VNI/TCVN3/Unicode)"]
        SpellChecker["WASM Từ điển Kiểm tra Lỗi chính tả"]
        AtomicFSService["Dịch vụ Đọc/Ghi File An toàn (Rust Core)"]
    end

    subgraph CLOUD_COLLAB ["4. MẠNG LƯỚI CỘNG TÁC & BẢO MẬT (ENTERPRISE)"]
        CRDTSyncService["Dịch vụ Đồng bộ CRDT (Yjs / WebSocket)"]
        SnapshotManager["Bộ Quản lý Phiên bản & Snapshot Debounce"]
        DLPWatermarkEngine["Engine Tạo Watermark & Giám sát Rò rỉ"]
        PKCS11Bridge["Cầu nối Ký số USB Token Doanh nghiệp"]
    end

    subgraph AGENT_SYSTEM ["5. HỆ THỐNG ĐIỀU HÀNH TỰ TRỊ (MULTI-AGENT)"]
        AgentOrchestrator["Bộ Điều phối Tiến trình (Task StateGraph)"]
        ASTMutatorTool["Công cụ Tác động Trực tiếp Cây AST"]
        ComplianceAuditor["Bộ Soát lỗi Thể thức & Sai lệch Số liệu"]
    end

    %% Tương tác
    UI_HOST <--> ENGINE_CORE
    ENGINE_CORE <--> LOCAL_PIPELINE
    ENGINE_CORE <--> CLOUD_COLLAB
    ENGINE_CORE <--> AGENT_SYSTEM
```

---

# 2. NHÓM LUỒNG TẦNG 1: NATIVE DESKTOP & VÒNG ĐỜI DỮ LIỆU CỤC BỘ

### Luồng 1.1: Khởi động Ứng dụng, Đọc đĩa & Phục hồi Sự cố (Crash Recovery)
*Mục đích: Đảm bảo ứng dụng bật lên ngay tức thì, tải file từ ổ cứng an toàn, và nếu có sự cố mất điện đột ngột thì khôi phục lại 100% trạng thái đang soạn thảo.*

```mermaid
flowchart TD
    Start([Người dùng bấm mở VietDesk]) --> CheckLock{Có tệp khóa .recovery.lock không?}
    
    CheckLock -- "Có (Dấu hiệu bị tắt đột ngột/Mất điện)" --> ReadWAL["Đọc bản ghi thay đổi tạm (Write-Ahead Log) từ Cache cục bộ"]
    ReadWAL --> ShowPrompt["Hiển thị hộp thoại: 'Phát hiện tài liệu chưa lưu. Bạn có muốn khôi phục?'"]
    ShowPrompt -- "Đồng ý" --> RestoreAST["Nạp dữ liệu tạm vào cây AST -> Phục hồi nguyên vẹn"]
    ShowPrompt -- "Bỏ qua" --> CleanWAL["Xóa tệp tạm -> Mở màn hình chờ"]

    CheckLock -- "Không" --> OpenPath{"Mở từ file hay Mở trang trắng?"}
    OpenPath -- "Mở trang trắng" --> InitEmpty["Khởi tạo AST Trống -> Áp dụng cấu hình mặc định A4"]
    OpenPath -- "Click đúp vào file trên đĩa (.docx, .vdesk)" --> NativeRead["Rust đọc luồng nhị phân (Binary Stream) từ ổ cứng"]
    NativeRead --> ParseFileType{"Kiểm tra định dạng"}
    ParseFileType -- "Định dạng nội bộ .vdesk" --> UnpackDirect["Giải nén nhanh -> Nạp thẳng vào bộ nhớ RAM (< 0.2s)"]
    ParseFileType -- "Định dạng ngoại lai .docx" --> RouteToConverter["Chuyển sang Bộ phân giải XML"]

    RestoreAST --> RenderCanvas([Sẵn sàng soạn thảo])
    CleanWAL --> RenderCanvas
    InitEmpty --> RenderCanvas
    UnpackDirect --> RenderCanvas
```

---

### Luồng 1.2: Đánh chặn Clipboard & Chuyển mã Tự động (WASM Pipeline)
*Mục đích: Người dùng dán văn bản từ các trang web cũ hoặc file cũ dùng font VNI/TCVN3, hệ thống tự động chuẩn hóa sang Unicode sạch sẽ mà không cần người dùng thao tác bằng tay qua Unikey.*

```mermaid
flowchart LR
    PasteAction([Người dùng nhấn Ctrl+V / Chuột phải Paste]) --> ClipSniff["Clipboard Interceptor chặn luồng dán"]
    ClipSniff --> GetRaw["Lấy dữ liệu chuỗi byte thô (Raw Byte Stream)"]
    GetRaw --> WASMDetect{"WASM Engine phân tích đặc trưng bảng mã"}
    
    WASMDetect -- "Phát hiện byte mã VNI (a\', a\`...)" --> VniMap["Chạy bảng ánh xạ VNI -> Unicode Dựng sẵn"]
    WASMDetect -- "Phát hiện byte mã TCVN3 (.vnTime)" --> TcvnMap["Chạy bảng ánh xạ TCVN3 -> Unicode Dựng sẵn"]
    WASMDetect -- "Đã là chuẩn Unicode" --> PassThrough["Giữ nguyên chuỗi gốc"]

    VniMap --> CleanText["Lọc ký tự điều khiển lỗi"]
    TcvnMap --> CleanText
    PassThrough --> CleanText

    CleanText --> TypoCheck["WASM SymSpell: Quét đối chiếu từ điển tiếng Việt"]
    TypoCheck --> HighlightError["Gắn cờ cảnh báo đỏ nếu phát hiện từ sai"]
    HighlightError --> InsertAST["Gắn đoạn text sạch vào vị trí con trỏ trong cây AST"]
    InsertAST --> UpdateView([Văn bản hiển thị chuẩn font Times New Roman])
```

---

### Luồng 1.3: Ghi đĩa Nguyên tử (Atomic Local Save - Chống Hỏng File)
*Mục đích: Không bao giờ ghi đè trực tiếp lên file đang mở. Nếu đang ghi mà máy sập nguồn, file gốc vẫn nguyên vẹn.*

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant Editor as Bộ nhớ RAM (AST State)
    participant DiskService as Dịch vụ Đĩa Rust (Native FS)
    participant Storage as Ổ cứng (File System)

    User->>Editor: Bấm Ctrl+S (Lưu tài liệu)
    Editor->>Editor: Tạo bản sao bất biến (Snapshot JSON) của cây AST
    Editor->>DiskService: Gửi chuỗi nhị phân cần lưu
    DiskService->>Storage: 1. Tạo tệp tạm: `tailieu.docx.tmp`
    DiskService->>Storage: 2. Ghi toàn bộ dữ liệu vào tệp `.tmp`
    DiskService->>Storage: 3. Lệnh OS Flush (`fsync`): Ép bộ nhớ đệm ghi xuống phiến đĩa
    DiskService->>Storage: 4. Đổi tên nguyên tử (Atomic Rename): `tailieu.docx.tmp` -> `tailieu.docx`
    Note over Storage: Tệp gốc được thay thế trong 1 micro-giây! Không sợ mất dữ liệu.
    DiskService-->>Editor: Xác nhận lưu thành công (Success)
    Editor-->>User: Đổi trạng thái tiêu đề: "Đã lưu vào máy"
```

---

# 3. NHÓM LUỒNG TẦNG 2: HÀNH CHÍNH NĐ30, OOXML & BẢNG TÍNH

### Luồng 2.1: Phân trang Ảo và Dồn trang A4 Thời gian thực (Virtual Pagination Logic)
*Mục đích: Giải quyết điểm yếu nhất của các trình soạn thảo web. Mô phỏng chính xác từng trang giấy in ấn A4, tự động dồn trang, chống dòng mồ côi (Orphan/Widow Control) theo đúng chuẩn in ấn nhà nước.*

```mermaid
flowchart TD
    NodeChange([Người dùng gõ chữ / chèn ảnh / thêm bảng]) --> MarkDirty["Đánh dấu đoạn văn bị thay đổi (Dirty Node)"]
    MarkDirty --> RecalcNode["Đo lường lại kích thước đồ họa (Font Metrics & DOM Height)"]
    RecalcNode --> LayoutEngine["Virtual Pagination Engine duyệt từ vị trí bẩn"]

    LayoutEngine --> LoopNodes{"Duyệt từng khối (Node) trên trang"}
    LoopNodes --> CheckBudget{"Tổng chiều cao các Node > Chiều cao khả dụng trang A4?"}

    CheckBudget -- "Chưa vượt (<= 728.5pt)" --> PlaceOnPage["Đặt Node nằm trọn trên Trang hiện tại"]
    PlaceOnPage --> LoopNodes

    CheckBudget -- "Vượt quá" --> NodeType{"Kiểm tra loại Node"}
    
    NodeType -- "Đoạn văn (Paragraph)" --> SplitPara{"Đoạn văn có > 2 dòng không?"}
    SplitPara -- "Có" --> OrphanRule["Áp dụng luật Widow/Orphan: Để lại tối thiểu 2 dòng trang cũ, đẩy phần còn lại sang trang mới"]
    SplitPara -- "Không (chỉ có 1 dòng)" --> PushEntire["Đẩy toàn bộ đoạn văn sang Trang mới"]

    NodeType -- "Bảng biểu (Table)" --> TableRule["Tách dòng bảng: Cắt ngang hàng (Row Boundary). Trang mới tự động chèn lặp lại Hàng Tiêu đề (Header Row)"]
    NodeType -- "Tiêu đề (Heading)" --> HeadingRule["Luật Không tách rời (Keep with next): Kéo tiêu đề sang trang mới cùng đoạn văn đầu tiên"]

    OrphanRule --> GeneratePageFrame["Tạo khung Trang mới (Canvas Frame)"]
    PushEntire --> GeneratePageFrame
    TableRule --> GeneratePageFrame
    HeadingRule --> GeneratePageFrame

    GeneratePageFrame --> InsertPageMeta["Đánh số trang tự động: Trang 1 ẩn/đặt góc, Trang 2+ đặt giữa đầu trang"]
    InsertPageMeta --> FinishPaging([Hoàn tất kết xuất trang WYSIWYG])
```

---

### Luồng 2.2: Chuyển đổi Hai chiều OOXML (Round-Trip `.docx` / `.xlsx`)
*Mục đích: Đọc và ghi file của Microsoft Office mà không làm mất định dạng hay vỡ layout.*

```mermaid
flowchart TD
    subgraph INGESTION ["CHIỀU MỞ FILE (IMPORT)"]
        InFile[".docx / .xlsx từ bên ngoài"] --> UnzipPkg["Giải nén gói ZIP Open Packaging Conventions (OPC)"]
        UnzipPkg --> ReadContent["Đọc [Content_Types].xml, document.xml, styles.xml"]
        ReadContent --> TokenizeXML["Bộ phân giải nhanh XML (Quick-XML / Streaming Parser)"]
        TokenizeXML --> MapToAST["Ánh xạ các thẻ chuẩn ECMA-376 (w:p, w:r, w:tbl) sang AST Nodes"]
        MapToAST --> InjectFallback["Xử lý phông chữ thiếu: Ánh xạ font tương đương (Font Metric Matching)"]
        InjectFallback --> RenderEditor["Hiển thị lên khung soạn thảo VietDesk"]
    end

    subgraph SERIALIZATION ["CHIỀU LƯU FILE (EXPORT)"]
        SaveReq([Yêu cầu xuất file .docx]) --> ReadInternalAST["Duyệt toàn bộ cây AST nội bộ"]
        ReadInternalAST --> BuildDOMTree["Tạo cây XML tương ứng chuẩn WordprocessingML / SpreadsheetML"]
        BuildDOMTree --> StyleMapper["Chuyển đổi Style VietDesk sang bảng chuẩn <w:styles>"]
        StyleMapper --> ZipCompress["Đóng gói ZIP kèm định danh quan hệ tệp <_rels>"]
        ZipCompress --> OutFile["File .docx tương thích 100% với Microsoft Word"]
    end

    RenderEditor -. "Người dùng chỉnh sửa" .-> SaveReq
```

---

### Luồng 2.3: Ký số Điện tử PKCS#11 & Niêm phong Tài liệu NĐ30
*Mục đích: Tích hợp thiết bị phần cứng USB Token, ký số văn bản hành chính theo đúng chuẩn pháp lý nhà nước Việt Nam.*

```mermaid
sequenceDiagram
    autonumber
    actor Signer as Người ký (Lãnh đạo)
    participant Client as VietDesk Client UI
    participant Bridge as Cầu nối PKCS#11 (Rust Driver)
    participant USB as Thiết bị USB Token CA
    participant Engine as Engine Niêm phong Văn bản

    Signer->>Client: Bấm nút "Ký số văn bản"
    Client->>Client: Khóa toàn bộ quyền chỉnh sửa tài liệu (Freeze AST)
    Client->>Bridge: Truy vấn danh sách Chứng thư số đang cắm
    Bridge->>USB: Gửi lệnh đọc khe cắm thiết bị (SmartCard Reader)
    USB-->>Bridge: Trả về Chứng thư số X.509 (Tên tổ chức, Hạn dùng)
    Bridge-->>Client: Hiển thị hộp thoại: Chọn chứng thư & Nhập mã PIN
    Signer->>Client: Nhập mã PIN cá nhân
    Client->>Bridge: Gửi mã PIN + Mã băm SHA-256 của tài liệu
    Bridge->>USB: Xác thực PIN & Yêu cầu ký dữ liệu bằng Private Key
    Note over USB: Chip an toàn phần cứng thực thi phép toán mật mã RSA/ECDSA
    USB-->>Bridge: Trả về Chữ ký số (Digital Signature Hash)
    Bridge-->>Engine: Chuyển chữ ký số & Thông tin chứng thực
    Engine->>Engine: Nhúng Chữ ký vào cấu trúc tài liệu (PDF/OOXML Signature)
    Engine->>Client: Đóng dấu hiển thị (Visual Stamp): Chữ ký đỏ + Tên người ký + Thời gian
    Client-->>Signer: Thông báo: "Văn bản đã được ký số và niêm phong chống sửa đổi!"
```

---

### Luồng 2.4: Bảng tính Kế toán, Đọc số tiền & Căn chỉnh Vùng in ấn
*Mục đích: Tự động hóa các nghiệp vụ kế toán đặc thù của Việt Nam (định dạng tiền tệ, viết chữ số tiền, ép trang in).*

```mermaid
flowchart TD
    subgraph CALCULATION ["1. XỬ LÝ NHẬP LIỆU & TÍNH TOÁN"]
        InputVal(["Nhập số vào ô A1: 15000000"]) --> FormatCell["Bấm định dạng tiền tệ Việt Nam (Format VND)"]
        FormatCell --> RenderVND["Hiển thị: 15.000.000 ₫ (Dùng dấu chấm phân cách nghìn)"]
        
        FormulaInput(["Nhập ô B1: =DOCSO(A1)"]) --> EvalEngine["Formula Engine chặn cú pháp hàm tùy biến"]
        EvalEngine --> CallWASMDocso["Truy xuất Module WASM DocsoVN"]
        CallWASMDocso --> ConvertAlgorithm["Thuật toán phân tích lớp: Tỷ, Triệu, Nghìn, Đồng + Xử lý 'mười' / 'mươi' / 'lăm' / 'nhất'"]
        ConvertAlgorithm --> ReturnText["Ô B1 hiển thị: 'Mười lăm triệu đồng chẵn'"]
    end

    subgraph PRINT_SETUP ["2. BỘ CĂN CHỈNH VÙNG IN (PRINT SETUP WIZARD)"]
        SelectArea(["Chọn dải bảng lương A1:M100 -> Bấm In"]) --> ScanMatrix["Quét kích thước tổng ma trận cột (Total Width in Pt)"]
        ScanMatrix --> CompareWidth{"Chiều rộng bảng > Khổ giấy A4 Ngang (297mm - Margin)?"}
        
        CompareWidth -- "Lớn hơn (Bị tràn trang)" --> AutoScale["Tự động kích hoạt thuật toán Fit-To-Page: Tính hệ số co dãn Scale Factor"]
        AutoScale --> ApplyScale["Co toàn bộ lưới bảng vừa vặn 100% trong chiều ngang 1 trang A4"]
        CompareWidth -- "Vừa vặn" --> KeepScale["Giữ tỉ lệ 100%"]

        ApplyScale --> PrintPreview["Hiển thị bản xem trước in ấn không bị xé cột"]
        KeepScale --> PrintPreview
    end
```

---

# 4. NHÓM LUỒNG TẦNG 3: ĐIỆN TOÁN ĐÁM MÂY, CỘNG TÁC & BẢO MẬT

### Luồng 3.1: Đồng bộ Thời gian thực CRDT & Xử lý Đa điểm (Multi-user Sync)
*Mục đích: Cho phép hàng chục người cùng mở một văn bản, gõ đồng thời mà không bị đè chữ, không có độ trễ, thấy con trỏ chuột của nhau theo thời gian thực.*

```mermaid
sequenceDiagram
    autonumber
    actor UserA as Người dùng A (Hà Nội)
    actor UserB as Người dùng B (TP.HCM)
    participant SockA as Client A WebSocket
    participant SockB as Client B WebSocket
    participant CollabCluster as Cụm Hocuspocus CRDT Server
    participant RedisPubSub as Redis Memory Bus

    UserA->>SockA: Gõ thêm chữ "Kính gửi: " (Vị trí Index 120)
    SockA->>SockA: Tạo thao tác Yjs Delta: `Insert(ID_A, 120, 'Kính gửi: ')`
    SockA->>CollabCluster: Gửi gói tin nhị phân WSS (Binary Protocol)
    CollabCluster->>CollabCluster: Hợp nhất vào bộ nhớ RAM (Y.Doc Merge)
    CollabCluster->>RedisPubSub: Phát sự kiện đồng bộ đến các Node mạng khác
    RedisPubSub->>CollabCluster: Chuyển tiếp tới kết nối của Client B
    CollabCluster->>SockB: Đẩy gói tin nhị phân CRDT Update
    SockB->>SockB: Áp dụng thuật toán CRDT Weaving (Tự động dàn xếp vị trí không xung đột)
    SockB-->>UserB: Chữ "Kính gửi: " xuất hiện tức thì (< 30ms) kèm tên Người dùng A
```

---

### Luồng 3.2: Rớt mạng Ngoại tuyến & Đồng bộ Bù (Offline Catch-Up)
*Mục đích: Đang làm việc thì mất mạng Wi-Fi, người dùng vẫn tiếp tục soạn thảo bình thường; khi có mạng lại, hệ thống tự động hòa giải và đồng bộ đầy đủ mà không mất chữ.*

```mermaid
flowchart TD
    OnlineState([Đang kết nối WebSocket]) --> NetworkDrop["Mất kết nối mạng (Socket Closed / Offline)"]
    NetworkDrop --> SwitchLocal["Chuyển Editor sang Chế độ Ngoại tuyến Tạm thời (Offline Mode)"]
    SwitchLocal --> ShowBanner["Hiển thị thanh trạng thái màu vàng: 'Đang làm việc ngoại tuyến'"]

    ShowBanner --> UserEdits["Người dùng tiếp tục gõ nội dung, chỉnh sửa bảng biểu"]
    UserEdits --> LocalIndexedDB["Mọi thao tác ghi dồn vào hàng đợi IndexedDB cục bộ (Pending Queue)"]

    LocalIndexedDB --> NetworkReturn["Phát hiện có mạng trở lại (Event: window.online)"]
    NetworkReturn --> ReconnectWS["Mở lại kết nối WebSocket tới Server"]
    ReconnectWS --> HandshakeVector["Gửi State Vector: 'Tôi đang ở phiên bản X, Server đang ở phiên bản mấy?'"]

    HandshakeVector --> DiffCalculation["Server tính toán độ chênh lệch (Diff Calculation)"]
    DiffCalculation --> TwoWayReconcile["Trao đổi chéo: Server gửi các sửa đổi người khác đã làm; Client đẩy Pending Queue lên"]
    TwoWayReconcile --> CRDTSolve["Thuật toán Yjs tự động hòa giải theo thứ tự Lamport Timestamp"]
    CRDTSolve --> FinishReconcile["Tài liệu cập nhật hoàn hảo, banner chuyển sang màu xanh: 'Đã đồng bộ'"]
```

---

### Luồng 3.3: Lịch sử Phiên bản & Time-Machine Rollback
*Mục đích: Cho phép người dùng tua lại tài liệu về bất kỳ thời điểm nào trong quá khứ để xem ai đã sửa cái gì và khôi phục lại bản cũ nếu cần.*

```mermaid
flowchart LR
    subgraph SAVE_TIMELINE ["GHI NHẬN LỊCH SỬ TỰ ĐỘNG"]
        EditStream["Dòng sự kiện chỉnh sửa liên tục"] --> DebounceFilter{"Đã ngừng gõ 10 giây HOẶC đủ 100 thay đổi?"}
        DebounceFilter -- "Chưa" --> ContinueWait["Tiếp tục tích lũy trong RAM"]
        DebounceFilter -- "Thỏa mãn" --> MakeSnapshot["Tạo bản ghi Snapshot (Nén Zstandard)"]
        MakeSnapshot --> PushMinIO["Lưu tệp Snapshot lên MinIO S3 Object Storage"]
        PushMinIO --> RecordMeta["Ghi metadata vào PostgreSQL: {version_id, timestamp, author, summary}"]
    end

    subgraph RESTORE_TIMELINE ["XEM LẠI & KHÔI PHỤC"]
        OpenHistory([Mở thanh 'Lịch sử phiên bản']) --> FetchList["Tải danh sách các mốc thời gian từ Server"]
        FetchList --> ClickVersion["Người dùng click vào mốc 'Hôm qua lúc 14:30'"]
        ClickVersion --> PullSnapshot["Tải snapshot tương ứng từ S3 về Client"]
        PullSnapshot --> ReadOnlyPreview["Mở cửa sổ xem trước (Chỉ đọc, hiển thị tô màu người sửa)"]
        ReadOnlyPreview --> ClickRevert{"Bấm 'Khôi phục bản này'?"}
        ClickRevert -- "Đồng ý" --> OverwriteCurrent["Ghi đè trạng thái AST hiện tại thành Snapshot cũ -> Phát tán bản cập nhật tới toàn bộ người đang mở"]
    end
```

---

### Luồng 3.4: Bảo mật DLP, Watermark Động & Phân quyền Hạt nhân
*Mục đích: Chống chụp trộm màn hình làm lộ tài liệu mật, ngăn chặn sao chép dữ liệu ra ngoài và phân quyền chi tiết đến từng đoạn văn.*

```mermaid
flowchart TD
    UserOpenDoc([Người dùng mở một tài liệu mật trong công ty]) --> AuthCheck["Kiểm tra danh tính người dùng & Quyền hạn (RBAC)"]
    
    AuthCheck --> LoadRules["Tải bộ quy tắc kiểm soát truy cập (Access Control Matrix)"]
    LoadRules --> RenderCanvas["Kết xuất tài liệu lên màn hình"]

    subgraph WATERMARK_DEFENSE ["1. LỚP PHÒNG THỦ WATERMARK ĐỘNG"]
        RenderCanvas --> InjectCanvas["Tự động phủ một lớp Canvas Watermark trong suốt góc 45 độ"]
        InjectCanvas --> DrawWatermark["Vẽ chìm: Tên nhân viên + Email + Địa chỉ IP + Mã định danh tài liệu"]
        DrawWatermark --> SetupGuard["Kích hoạt MutationObserver theo dõi cây HTML"]
        SetupGuard --> TamperCheck{"Người dùng cố tình xóa thẻ Watermark bằng DevTools?"}
        TamperCheck -- "Phát hiện can thiệp" --> DestroySession["Hủy ngay lập tức cây DOM -> Khóa màn hình -> Báo cáo vi phạm về máy chủ"]
    end

    subgraph DLP_RULES ["2. LỚP PHÒNG THỦ CHỐNG THẤT THOÁT DỮ LIỆU (DLP)"]
        UserAction([Người dùng bôi đen chữ -> Bấm Ctrl+C]) --> CopyIntercept["Trình duyệt đánh chặn thao tác Copy"]
        CopyIntercept --> CheckPermission{"Tài liệu có bị gắn cờ MẬT (Confidential) không?"}
        CheckPermission -- "Có" --> BlockCopy["Chặn thao tác copy -> Hiện cảnh báo: 'Chính sách công ty không cho phép sao chép tài liệu này'"]
        CheckPermission -- "Không" --> AllowCopy["Cho phép đưa vào Clipboard"]
    end
```

---

# 5. NHÓM LUỒNG TẦNG 4: HỆ ĐIỀU HÀNH VĂN PHÒNG TỰ TRỊ (CỬA CUỐI)

### Luồng 4.1: Tiếp nhận Mục tiêu, Lập kế hoạch & Phân rã Tác vụ (Goal Planning)
*Mục đích: Khi người dùng đưa ra một mệnh lệnh tự nhiên cấp cao, Agent tự động phân tích thành một đồ thị tác vụ thực thi tuần tự.*

```mermaid
flowchart TD
    GoalInput(["Người dùng ra lệnh: 'Lập báo cáo tài chính quý 3 từ file sao kê ngân hàng và soạn tờ trình xin phê duyệt gửi Tổng Giám đốc'"]) --> AgentOrchestrator["Agentic Master Orchestrator tiếp nhận"]
    
    AgentOrchestrator --> ParseIntent["Phân tích ý định & Thực thể (Intent & Entity Extraction)"]
    ParseIntent --> CreatePlan["Tạo Đồ thị Kế hoạch Thực thi (Task StateGraph)"]

    subgraph TASK_GRAPH ["ĐỒ THỊ TÁC VỤ LIÊN HOÀN"]
        Step1["Tác vụ 1 (Data Agent): Đọc file sao kê ngân hàng .xlsx -> Trích xuất doanh thu, chi phí"]
        Step2["Tác vụ 2 (Math Auditor): Kiểm toán số liệu, đối chiếu số dư đầu kỳ và cuối kỳ"]
        Step3["Tác vụ 3 (Template Agent): Khởi tạo tài liệu Tờ trình chuẩn mẫu Nghị định 30"]
        Step4["Tác vụ 4 (Legal Writer): Điền nội dung căn cứ pháp lý & liên kết bảng số liệu vào Tờ trình"]
        Step5["Tác vụ 5 (Reviewer): Thẩm định toàn diện thể thức NĐ30 trước khi trình ký"]
    end

    CreatePlan --> Step1
    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
    Step4 --> Step5
    Step5 --> ReadyForApproval([Trình người dùng phê duyệt kết quả])
```

---

### Luồng 4.2: Tương tác Cây AST & Thẩm định Thể thức NĐ30 Tự động
*Mục đích: Agent không gõ chữ như con người mà sử dụng Tool Calling để can thiệp trực tiếp vào cấu trúc dữ liệu JSON AST của tài liệu.*

```mermaid
sequenceDiagram
    autonumber
    participant Agent as Legal & NĐ30 Agent
    participant Tool as Bộ Công cụ AST Tooling
    participant DocAST as Cây Dữ liệu Tài liệu (JSON State)
    participant UI as Màn hình Người dùng

    Agent->>Tool: Gọi lệnh: `insert_nd30_template("TO_TRINH")`
    Tool->>DocAST: Chèn khung: Quốc hiệu, Tên cơ quan, Tên văn bản, Nơi nhận
    DocAST-->>UI: Hiển thị ngay khung mẫu chuẩn lề A4
    
    Agent->>Tool: Gọi lệnh: `inject_paragraph(section="body", text="Kính gửi: Tổng Giám đốc...")`
    Tool->>DocAST: Nạp TextNode với thuộc tính font: Times New Roman 14pt
    
    Agent->>Tool: Gọi lệnh: `audit_compliance_rules("NGHI_DINH_30")`
    Tool->>DocAST: Quét toàn bộ cây AST đối chiếu bộ quy tắc:
    Note over Tool: Kiểm tra 1: Lề trang (Top 20mm, Bottom 20mm, Left 30mm, Right 15mm)? -> ĐẠT<br/>Kiểm tra 2: Tiêu ngữ có gạch chân đúng độ dài câu không? -> ĐẠT<br/>Kiểm tra 3: Dòng địa danh ngày tháng có in nghiêng không? -> ĐẠT
    Tool-->>Agent: Kết quả thẩm định: 100% Tuân thủ Nghị định 30/2020/NĐ-CP
    Agent-->>UI: Đánh dấu tích xanh: "Văn bản đạt chuẩn thể thức hành chính"
```

---

### Luồng 4.3: Đồng bộ Dữ liệu Chéo Đa Tài liệu (Cross-Document Single Source of Truth)
*Mục đích: Khi số liệu trong file Excel thay đổi, các bảng biểu trong file Word báo cáo và biểu đồ trong Slide thuyết trình tự động cập nhật theo thời gian thực mà không cần làm thủ công.*

```mermaid
flowchart TD
    UserEditsSheet(["Người dùng sửa doanh thu tháng 9 trong Sheets (Ô C15): từ 10 tỷ -> 12 tỷ"]) --> TriggerCellEvent["Engine Bảng tính kích hoạt sự kiện: onCellValueChange"]
    
    TriggerCellEvent --> DependencyGraph["Cross-Doc Orchestrator tra cứu Đồ thị Phụ thuộc (Link Registry)"]
    DependencyGraph --> DetectSubscribers["Phát hiện 2 nơi đang đăng ký lấy số liệu từ Ô C15:
    1. Bảng số 2 trong Tờ trình Word (Doc ID: #W102)
    2. Biểu đồ cột trong Slide Thuyết trình (Doc ID: #S504)"]

    subgraph SYNC_DISPATCH ["ĐỒNG BỘ TỰ ĐỘNG KHÔNG ĐỘ TRỄ"]
        DetectSubscribers --> MutateWordTable["Gửi bản vá AST tới Word: Cập nhật dòng 3 cột 2 thành 12.000.000.000 ₫"]
        DetectSubscribers --> MutateSlideChart["Gửi bản vá AST tới Slide: Vẽ lại cột tháng 9 cao tương ứng mức 12 tỷ"]
        DetectSubscribers --> RecomputeDocso["Cập nhật đoạn văn text: Tự động đổi chữ 'mười tỷ đồng' thành 'mười hai tỷ đồng'"]
    end

    MutateWordTable --> HighlightDiff["Hiển thị viền xanh lá nhấp nháy tại các vị trí vừa tự động đồng bộ"]
    MutateSlideChart --> HighlightDiff
    RecomputeDocso --> HighlightDiff
    HighlightDiff --> NotifyDone(["Thông báo: 'Đã đồng bộ dữ liệu chéo thành công!'"])
```

---

### Luồng 4.4: Kiểm duyệt Con người & Ban hành Tự động (Human-in-the-Loop)
*Mục đích: Đảm bảo nguyên tắc an toàn tối thượng: AI Agent có thể làm hết 99% công việc soạn thảo và tính toán, nhưng quyết định cuối cùng và tính pháp lý luôn thuộc về con người.*

```mermaid
flowchart TD
    AgentDone([Agent hoàn tất toàn bộ chu trình soạn thảo và kiểm toán]) --> CreateDiffView["Tạo chế độ xem So sánh Thay đổi (Pending Approval Diff View)"]
    
    CreateDiffView --> PresentToBoss["Hiển thị trên màn hình Lãnh đạo:
    - Phần chữ xanh: Agent mới thêm vào
    - Phần chữ đỏ gạch ngang: Agent đề xuất lược bỏ
    - Bảng báo cáo kiểm toán số liệu đính kèm"]

    PresentToBoss --> UserDecision{"Quyết định của Người dùng / Lãnh đạo"}

    UserDecision -- "Cần sửa lại" --> FeedbackInput["Nhập ghi chú phản hồi: 'Bổ sung thêm điều khoản bảo hành'"]
    FeedbackInput --> AgentRework["Agent tiếp nhận phản hồi -> Sửa lại cây AST -> Trình lại"]

    UserDecision -- "Chấp thuận (Duyệt)" --> TriggerSign["Bấm nút DUYỆT & KÝ SỐ"]
    TriggerSign --> InvokeUSB["Hệ thống kích hoạt luồng Ký số Token USB CA"]
    InvokeUSB --> RenderFinalPDF["Gotenberg Worker Pool xuất file PDF vector chuẩn"]
    RenderFinalPDF --> DispatchWorkflow["Tự động gửi email/luân chuyển văn bản tới các phòng ban liên quan"]
    DispatchWorkflow --> ArchiveMinIO["Lưu trữ vĩnh viễn vào kho lưu trữ số của cơ quan"]
```

---

## 6. MA TRẬN TỔNG KẾT CÁC LUỒNG THEO 4 CẤP ĐỘ

| Cấp độ | Tên Luồng Logic | Đầu vào (Input) | Thành phần xử lý chính | Đầu ra (Output) |
| :--- | :--- | :--- | :--- | :--- |
| **Cơ bản** | **1.1. Khởi động & Crash Recovery** | Tệp đĩa / Tệp khóa phục hồi | Rust Tauri Backend, WAL Cache | Khôi phục 100% dữ liệu chưa lưu |
| | **1.2. Đánh chặn Clipboard** | Chuỗi byte từ clipboard hệ thống | WASM Charset & SymSpell Mapper | Text Unicode sạch, đúng font |
| | **1.3. Ghi đĩa nguyên tử** | Trạng thái AST tài liệu | Rust FS, lệnh atomic rename | File lưu an toàn chống sập nguồn |
| **Pro** | **2.1. Phân trang ảo A4** | Luồng Node thay đổi liên tục | Virtual Pagination Engine | Ngắt trang milimet chuẩn in ấn NĐ30 |
| | **2.2. Round-Trip OOXML** | File nhị phân `.docx` / `.xlsx` | Quick-XML Parser, OPC Zipper | Tương thích 2 chiều tuyệt đối với MS Office |
| | **2.3. Ký số Token PKCS#11** | Chứng thư số USB Token + PIN | Cầu nối PKCS#11, SHA-256 Engine | File niêm phong chữ ký số hợp pháp |
| | **2.4. Kế toán & Căn lề in ấn** | Số tiền thô + Ma trận ô | WASM Docso, Print Setup Wizard | Chữ tiền tệ tiếng Việt + Vừa khít trang in |
| **Ultimate** | **3.1. Đồng bộ CRDT Đa điểm** | Binary Delta qua WebSocket | Hocuspocus Cluster, Yjs Weaving | Trải nghiệm cộng tác độ trễ $< 30\text{ms}$ |
| | **3.2. Ngoại tuyến & Đồng bộ bù** | Trạng thái mất mạng internet | IndexedDB Queue, Lamport Vector | Hòa giải xung đột tự động khi có mạng lại |
| | **3.3. Lịch sử phiên bản** | Chuỗi thay đổi liên tục | MinIO S3, Zstandard Compressor | Time-Machine khôi phục bất kỳ thời điểm nào |
| | **3.4. DLP & Watermark động** | Phiên đăng nhập người dùng | WebGL Shader, MutationObserver | Chống chụp trộm màn hình & chống rò rỉ |
| **Cửa Cuối**| **4.1. Phân rã mục tiêu Agent** | Lệnh ngôn ngữ tự nhiên cấp cao | StateGraph Master Orchestrator | Đồ thị tác vụ thực thi tự động liên hoàn |
| | **4.2. Thao tác trên cây AST** | Yêu cầu nghiệp vụ hành chính | AST Tooling, Compliance Rules | Văn bản chuẩn thể thức NĐ30 tự động |
| | **4.3. Đồng bộ chéo tài liệu** | 1 ô thay đổi trong Sheets | Dependency Graph Link Registry | Word, Excel, Slide đồng bộ tự động 100% |
| | **4.4. Duyệt & Ban hành tự động** | Bản dự thảo kèm bảng kiểm toán | Human-in-the-Loop UI, Job Dispatcher | Ban hành văn bản chính thức chỉ với 1 cú click |

---
*Tài liệu này hoàn thiện 100% logic cấu trúc hệ thống và quy trình nghiệp vụ, đóng vai trò bản vẽ thiết kế kỹ thuật trước khi bước vào giai đoạn code.*
