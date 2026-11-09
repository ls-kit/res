// src/utils/dateFormat.js

export function formatDateBn(dateStr) {
  if (!dateStr) return ''
  
  let d
  // যদি টাইমস্ট্যাম্প (T বা Z) থাকে, তবে সরাসরি Date অবজেক্টে রূপান্তর করব
  if (String(dateStr).includes('T')) {
    d = new Date(dateStr)
  } else {
    d = new Date(dateStr + 'T00:00:00')
  }

  // চেক করা তারিখটি ভ্যালিড কিনা
  if (isNaN(d.getTime())) return ''

  const formatted = new Intl.DateTimeFormat('bn-BD', {
    day: 'numeric',
    month: 'long',
    year: '2-digit'
  }).format(d)
  
  // কমা (,) মুছে ফেলা
  return formatted.replace(/,/g, '')
}