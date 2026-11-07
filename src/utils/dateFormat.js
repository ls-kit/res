// src/utils/dateFormat.js

export function formatDateBn(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00') 
  
  // Intl দিয়ে তারিখ বের করা (এখানে কমা আসে)
  const formatted = new Intl.DateTimeFormat('bn-BD', {
    day: 'numeric',
    month: 'long',
    year: '2-digit'
  }).format(d)
  
  // কমা (,) মুছে ফেলা
  return formatted.replace(/,/g, '')
}