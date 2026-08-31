// FIFO原価計算はSupabaseのregister_sale RPC側で一元処理します。
// クライアント側のDashboard.tsxを書き換える方式は、既存コードとの重複や
// ビルド時のテキスト置換事故を起こすため使用しません。
console.log("FIFO cost is handled by the register_sale RPC. No client patch applied.");
