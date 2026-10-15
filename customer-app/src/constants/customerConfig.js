export const channelTypeMap = {
  'Kênh siêu thị': ['Đại siêu thị', 'Siêu Thị Lớn', 'Siêu thị vừa và nhỏ'],
  'Kênh sỉ': ['Khách sỉ lớn', 'Khách sỉ vừa và nhỏ'],
  'Kênh trường học': ['Khách trường học'],
  'Kênh tiêu thụ trực tiếp': ['Cửa hàng tạp hóa', 'Khách lẻ tiêu thụ trực tiếp'],
  'Kênh horeca': ['Kênh horeca'],
  'Kênh công nghiệp': ['Kênh công nghiệp'],
}
export const nganh_hang_options = [
  'Bim quẩy',
  'Chân gà',
  'Hàng ướt',
  'Sốt',
  'Thạnh',
  'Sữa chua',
]

export const CHANNEL_OPTIONS = Object.keys(channelTypeMap)
export const CHECK_LABELS = {
  accuracyOk: 'Độ chính xác GPS sai',
  spreadOk: 'Các mẫu GPS lệch nhau',
  freshOk: 'Dữ liệu GPS cũ quá 30 giây',
  speedOk: 'Tốc độ di chuyển bất thường',
  signalStableOk: 'Tín hiệu GPS dao động quá 50m',
  sampleCountOk: 'Chưa đủ 4 mẫu GPS để kiểm tra',
  noMockedFlag: 'Phát hiện mock location/vị trí giả',
}

export const ADMIN_CODE_MAP = {
  ADHAI: 'Nguyễn Đình Hải',
  ADHA: 'Nguyễn Đình Hà',
  ADDUC: 'Nguyễn Anh Đức',
  ADCUONG: 'Nguyễn Đăng Cương',
  ADTEST: 'Admin Test',
}

// Product categories and their checkbox fields
export const PRODUCT_GROUPS = {
  acbt: {
    label: 'Kệ Trưng Bày',
    fields: ['CoKeACBT', 'TraThuongTB', 'CoHangDoiThuKhong', 'DoiThuLays', 'DoiThuOishi', 'DoiThuPoca', 'DoiThuOrion', 'DoiThuKhac'],
  },
  viHang: {
    label: 'Vỉ Treo',
    fields: ['CoViACBT', 'CoHangDoiThuVi', 'ViDoiThuLays', 'ViDoiThuOishi', 'ViDoiThuPoca', 'ViDoiThuOrion', 'ViDoiThuKhac'],
  },
  chanGa: {
    label: 'Bảo Phủ - Chân Gà',
    fields: ['ChanGaACBT', 'ChanGaDoiThu'],
  },
  bimKho: {
    label: 'Bảo Phủ - Snack Khô',
    fields: ['BimKhoACBT', 'BimKhoDoiThuLays', 'BimKhoDoiThuOishi', 'BimKhoDoiThuPoca', 'BimKhoDoiThuOrion', 'BimKhoDoiThuKhac'],
  },
  bimUot: {
    label: 'Bảo Phủ - Snack Ướt',
    fields: ['BimUotACBT', 'BimUotDoiThu'],
  },
}

export const PRODUCT_FIELD_LABELS = {
  CoKeACBT: 'Có kệ ACBT',
  CoHangDoiThuKhong: 'Có kệ hàng Đối thủ',
  TraThuongTB: 'Có kệ trả thường TB',
  DoiThuLays: "Kệ Lay's",
  DoiThuOishi: 'Kệ Oishi',
  DoiThuPoca: 'Kệ Poca',
  DoiThuKhac: 'Kệ Khác',
  DoiThuOrion: 'Kệ Orion',
  CoViACBT: 'Có vỉ ACBT',
  CoHangDoiThuVi: 'Có vỉ hàng Đối thủ không',
  ViDoiThuLays: "Vỉ Lay's",
  ViDoiThuOishi: 'Vỉ Oishi',
  ViDoiThuPoca: 'Vỉ Poca',
  ViDoiThuKhac: 'Vỉ Khác',
  ViDoiThuOrion: 'Vỉ Orion',
  ChanGaACBT: 'Chân Gà ACBT',
  ChanGaDoiThu: 'Chân Gà Đối Thủ',
  BimKhoACBT: 'Snack ACBT',
  BimKhoDoiThuLays: "Snack Lay's",
  BimKhoDoiThuOishi: 'Snack Oishi',
  BimKhoDoiThuPoca: 'Snack Poca',
  BimKhoDoiThuKhac: 'Snack Khác',
  BimKhoDoiThuOrion: 'Snack Orion',
  BimUotACBT: 'Snack Ướt ACBT',
  BimUotDoiThu: 'Snack Ướt Đối Thủ',
}
