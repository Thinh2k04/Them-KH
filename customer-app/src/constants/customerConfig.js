export const nppByKV = {
  KV1: [
    'NPP Bảo Lâm',
    'NPP Công Giang',
    'NPP Cường Thịnh',
    'NPP Đức Nam Tiến',
    'NPP Dũng Cúc',
    'NPP Lâm Hạ',
    'NPP Long Liên',
    'NPP Nguyên Vũ',
    'NPP Thảo Nam',
    'NPP Tuấn Huê',
    'NPP Tuấn Yến',
    'NPP Vũ Tấm',
  ],
  KV2: [
    'NPP Duy Anh',
    
    'NPP Hùng Huệ',
    'NPP Long Châm',
    'NPP Ngọc Kiên',
    'NPP Ngọc Thêu',
    'NPP Phong Hiền',
    
    'NPP Phương Đông',
    'NPP Thành Lụa',
    'NPP Tuấn Huyền',
  ],
  KV3: [
    'NPP Hoa Việt',
    'NPP Phúc Thịnh',
    'NPP Bảo Cường',
    'NPP Hikoji',
    'NPP Long Hải',
    'NPP Tân Hoa',
    'NPP Tây Đô',
    'NPP Thắng Lợi',
    'NPP Thành Hân',
    'NPP Tiến Thịnh',
  ],
  KV4: [
    'NPP Tùng Phương',
    'NPP Ánh Thu',
    'NPP Đức Oanh',
    'NPP Dương Minh',
    'NPP Dũng Béo',
    'NPP Hưng Thịnh',
    'NPP Ngọc Phúc',
    'NPP Nguyễn Đình Hân',
    'NPP Tân Thúy',
    'NPP Thăng Hương',
    'NPP Thảo Thắng',
    
  ],
  KV5: [
    'NPP Đồng Lợi',
    'NPP Hải Hằng',
    'NPP Hiền Cường',
    'NPP Hoàng Minh',
    'NPP Oanh Định',
    'NPP Sơn Lâm',
    'NPP Thái Hoà',
    'NPP Thảo Xuân',
    'NPP Duy Khoa',
    'NPP Tuấn Vân',
    'NPP Vũ Đức Nam',
  ],
  KV6: [
    'NPP Anh Minh HT',
    'NPP Hà Thanh',
    'NPP Hồng Đức',
    'NPP Linh Trang',
    'NPP Mạnh Hà 1',
    'NPP Mạnh Hà 2',
    'NPP Minh Châu',
    'NPP Minh Lộc',
    'NPP Nhung Tùng',
    'NPP Phương Hà',
    'NPP Tân Bích An',
    'NPP Thanh Bình',
    'NPP Thành Thanh',
    'NPP Thông Thơm',
    'NPP Trường Hằng',
  ],
}

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

export const KV_OPTIONS = Object.keys(nppByKV)
export const CHANNEL_OPTIONS = Object.keys(channelTypeMap)
export const NPP_OPTIONS = Object.values(nppByKV).flat()
export const CHECK_LABELS = {
  accuracyOk: 'GPS sai (nghi ngờ fake)',
  spreadOk: 'Các mẫu GPS ổn định',
  freshOk: 'Dữ liệu GPS mới',
  speedOk: 'Không có tốc độ di chuyển bất thường',
  signalStableOk: 'Tín hiệu GPS ổn định',
  noAutomationFlag: 'Không phát hiện cờ automation',
  timezoneOk: 'Múi giờ thiết bị hợp lệ',
  onlineOk: 'Thiết bị đang online',
}

export const ADMIN_CODE_MAP = {
  ADTHANH: 'Ngô Ngọc Thành',
  ADHAI: 'Nguyễn Đình Hải',
  ADHA: 'Nguyễn Đình Hà',
  ADDUC: 'Nguyễn Anh Đức',
  ADHUNG: 'Nguyễn Mạnh Hùng',
  ADTEST: 'Admin Test',
}

// Product categories and their checkbox fields
export const PRODUCT_GROUPS = {
  acbt: {
    label: 'Kệ Trưng Bày',
    fields: ['CoKeACBT', 'TraThuongTB', 'CoHangDoiThuKhong', 'DoiThuLays', 'DoiThuOishi', 'DoiThuPoca', 'DoiThuKhac'],
  },
  viHang: {
    label: 'Vỉ Treo',
    fields: ['CoViACBT', 'CoHangDoiThuVi', 'ViDoiThuLays', 'ViDoiThuOishi', 'ViDoiThuPoca', 'ViDoiThuKhac'],
  },
  chanGa: {
    label: 'Bảo Phủ - Chân Gà',
    fields: ['ChanGaACBT', 'ChanGaDoiThu'],
  },
  bimKho: {
    label: 'Bảo Phủ - Snack Khô',
    fields: ['BimKhoACBT', 'BimKhoDoiThuLays', 'BimKhoDoiThuOishi', 'BimKhoDoiThuPoca', 'BimKhoDoiThuKhac'],
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
  CoViACBT: 'Có vỉ ACBT',
  CoHangDoiThuVi: 'Có vỉ hàng Đối thủ không',
  ViDoiThuLays: "Vỉ Lay's",
  ViDoiThuOishi: 'Vỉ Oishi',
  ViDoiThuPoca: 'Vỉ Poca',
  ViDoiThuKhac: 'Vỉ Khác',
  ChanGaACBT: 'Chân Gà ACBT',
  ChanGaDoiThu: 'Chân Gà Đối Thủ',
  BimKhoACBT: 'Snack ACBT',
  BimKhoDoiThuLays: "Snack Lay's",
  BimKhoDoiThuOishi: 'Snack Oishi',
  BimKhoDoiThuPoca: 'Snack Poca',
  BimKhoDoiThuKhac: 'Snack Khác',
  BimUotACBT: 'Snack Ướt ACBT',
  BimUotDoiThu: 'Snack Ướt Đối Thủ',
}
