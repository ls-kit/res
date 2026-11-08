<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'
import html2canvas from 'html2canvas' // 🔥 ইমেজ ডাউনলোডের জন্য
import { useRouter } from 'vue-router'
const router = useRouter()
const savingDraft = ref(false)

async function saveDraft() {
  if (!planList.value.length) return showToast('তালিকাটি খালি!')
  savingDraft.value = true
  
  const { error } = await supabase.from('purchase_drafts').insert({
    restaurant_id: getActiveRestaurantId(),
    items: planList.value,
    status: 'pending'
  })
  
  savingDraft.value = false
  if (error) return showToast('সেভ হয়নি: ' + error.message)
  
  showToast('✅ ড্রাফট সেভ হয়েছে!')
  router.push('/today') // সরাসরি টুডে পেজে নিয়ে যাবে
}



const { profile } = useAuth()
const loading = ref(true)
const items = ref([])
const purchases = ref([])
const suppliersList = ref([])

const planList = ref([])
const searchQuery = ref('')
const toast = ref('')
const isDownloading = ref(false)
const printArea = ref(null) // ইমেজ ক্যাপচার করার এরিয়া

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n || 0)
}

async function loadData() {
  if (!profile.value) {
    await new Promise(resolve => {
      const check = setInterval(() => {
        if (profile.value) { clearInterval(check); resolve() }
      }, 100)
      setTimeout(() => { clearInterval(check); resolve() }, 3000)
    })
  }

  const rid = getActiveRestaurantId()
  if (!rid) { loading.value = false; return }

  const [itemsRes, suppliersRes] = await Promise.all([
    supabase.from('items').select('*').eq('restaurant_id', rid).order('name'),
    supabase.from('suppliers').select('*').eq('restaurant_id', rid).order('name')
  ])
  
  items.value = itemsRes.data || []
  suppliersList.value = suppliersRes.data || []

  const { data: pData } = await supabase
    .from('purchases')
    .select('item_name, supplier, unit_price')
    .eq('restaurant_id', rid)
    .not('supplier', 'is', null)
    .not('unit_price', 'is', null)

  purchases.value = pData || []
  loading.value = false
}

const cheapestSuppliers = computed(() => {
  const grouped = {}
  purchases.value.forEach(p => {
    if (!grouped[p.item_name]) grouped[p.item_name] = {}
    if (!grouped[p.item_name][p.supplier]) grouped[p.item_name][p.supplier] = { sum: 0, count: 0 }
    grouped[p.item_name][p.supplier].sum += Number(p.unit_price)
    grouped[p.item_name][p.supplier].count += 1
  })

  const result = {}
  for (const [item, supData] of Object.entries(grouped)) {
    let bestSup = null
    let minAvg = Infinity
    for (const [sup, data] of Object.entries(supData)) {
      const avg = data.sum / data.count
      if (avg < minAvg) { minAvg = avg; bestSup = sup }
    }
    result[item] = { supplier: bestSup, avgPrice: minAvg }
  }
  return result
})

const filteredItems = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(i => i.name.toLowerCase().includes(q))
})

function addToPlan(item) {
  const exists = planList.value.find(p => p.item_name === item.name)
  if (exists) return showToast('পণ্যটি ইতিমধ্যেই তালিকায় আছে!')
  
  const cheapest = cheapestSuppliers.value[item.name] || {}
  planList.value.push({
    item_name: item.name,
    unit: item.default_unit,
    quantity: 1,
    max_price: item.last_price || cheapest.avgPrice || 0,
    supplier: cheapest.supplier || suppliersList.value[0]?.name || ''
  })
  showToast(`✅ ${item.name} যোগ হয়েছে`)
}

function removeFromPlan(index) {
  planList.value.splice(index, 1)
}

const totalEstCost = computed(() => {
  return planList.value.reduce((sum, p) => sum + (Number(p.max_price) * Number(p.quantity)), 0)
})

// দোকান অনুযায়ী সাজানো (যাদের দোকান নেই তারা সবার শেষে থাকবে)
const sortedPlanList = computed(() => {
  return [...planList.value].sort((a, b) => {
    const supA = (a.supplier || '').trim()
    const supB = (b.supplier || '').trim()
    
    if (supA === supB) return a.item_name.localeCompare(b.item_name, 'bn') // একই দোকান হলে পণ্যের নাম অনুযায়ী
    if (!supA) return 1
    if (!supB) return -1
    return supA.localeCompare(supB, 'bn') // দোকানের নাম অনুযায়ী
  })
})


// 🔥 ইমেজ ডাউনলোড ফাংশন
async function downloadImage() {
  if (!planList.value.length) return showToast('তালিকাটি খালি!')
  isDownloading.value = true
  
  try {
    // প্রিন্ট এরিয়াটি DOM-এ নেই, তাই সাময়িকভাবে স্ক্রিনের বাইরে রেন্ডার করব
    const canvas = await html2canvas(printArea.value, {
      scale: 2, // হাই কোয়ালিটি
      backgroundColor: '#ffffff',
      useCORS: true
    })
    
    const imgData = canvas.toDataURL('image/jpeg', 0.9)
    const link = document.createElement('a')
    link.href = imgData
    link.download = `Bazar_List_${new Date().toISOString().slice(0,10)}.jpg`
    link.click()
    
    showToast('✅ ছবি ডাউনলোড হয়েছে')
  } catch (err) {
    showToast('ডাউনলোডে সমস্যা হয়েছে!')
  } finally {
    isDownloading.value = false
  }
}

// 🔥 টেক্সট কপি ফাংশন
async function copyAsText() {
  if (!planList.value.length) return showToast('তালিকাটি খালি!')
  
  let text = `🛒 বাজারের তালিকা\n\n`
  planList.value.forEach(p => {
    text += `☐ ${p.item_name} - ${p.quantity} ${p.unit}`
    if (p.supplier) text += ` (${p.supplier})`
    text += `\n`
  })
  text += `\nসম্ভাব্য সর্বোচ্চ খরচ: ৳ ${fmt(totalEstCost.value)}`
  
  try {
    await navigator.clipboard.writeText(text)
    showToast('✅ তালিকাটি কপি হয়েছে!')
  } catch (err) {
    showToast('কপি করা যায়নি!')
  }
}

onMounted(loadData)
</script>

<template>
  <div class="px-3 pt-4 pb-24 space-y-4 bg-[#f4f7fb] min-h-screen relative">
    
    <!-- Header -->
    <div class="bg-gradient-to-r from-[#0b172a] to-slate-800 rounded-xl p-4 text-white shadow-sm flex items-center justify-between">
      <div>
        <h2 class="text-[15px] font-bold">বাজার পরিকল্পনা</h2>
        <p class="text-[11px] text-white/70 mt-0.5">কেনাকাটার তালিকা তৈরি করুন</p>
      </div>
      <button @click="downloadImage" :disabled="isDownloading" class="bg-emerald-600 px-3 py-1.5 rounded-lg text-[11px] font-bold active:scale-95 flex items-center gap-1.5 disabled:opacity-50">
        {{ isDownloading ? '...' : '📥 ডাউনলোড' }}
      </button>

        <button @click="saveDraft" :disabled="savingDraft" class="bg-blue-600 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white active:scale-95 flex items-center gap-1.5 disabled:opacity-50">
        {{ savingDraft ? '...' : '💾 ড্রাফট সেভ' }}
        </button>
    </div>

    <!-- Item Selection -->
    <!-- Item Selection Section -->
    <div class="space-y-2">
    <div class="relative">
        <input v-model="searchQuery" type="search" placeholder="🔍 পণ্য খুঁজুন..." class="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-white outline-none text-[12px] shadow-sm focus:border-blue-500" />
        <span class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
    </div>

    <!-- 🔥 3 Column Grid Layout -->
    <div class="grid grid-cols-3 gap-1 max-h-32 overflow-y-auto pb-1 pr-0.5">
        <button 
        v-for="item in filteredItems" 
        :key="item.id" 
        @click="addToPlan(item)"
        class="bg-white border border-slate-200 rounded-md p-1.5 shadow-sm active:scale-95 flex flex-col justify-between text-left h-74 relative"
        >
        <p class="text-[11px] font-bold text-slate-800 truncate leading-tight">{{ item.name }}</p>
        <p class="text-[8px] text-slate-500">সর্বোচ্চ: ৳{{ item.last_price || 0 }}</p>
        
        <!-- প্লাস আইকন -->
        <div class="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[10px]">
            +
        </div>
        </button>
    </div>

    <div class="flex justify-end">
        <button @click="$router.push('/items')" class="text-[10px] text-blue-600 font-bold flex items-center gap-1 active:scale-95">
        ➕ নতুন পণ্য
        </button>
    </div>
    </div>

    <!-- Plan List UI -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <p class="text-[13px] font-bold text-slate-800">আমার বাজারের তালিকা</p>
        <span class="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded font-bold">{{ planList.length }} টি</span>
      </div>

      <div v-if="!planList.length" class="p-8 text-center">
        <p class="text-4xl mb-2">🛒</p>
        <p class="text-[12px] text-slate-500">উপরের তালিকা থেকে পণ্য যোগ করুন</p>
      </div>

      <div class="divide-y divide-slate-100">
        <div v-for="(p, i) in planList" :key="i" class="p-3 grid grid-cols-12 gap-2 items-center">
          <div class="col-span-5">
            <p class="text-[13px] font-bold text-slate-800">{{ p.item_name }}</p>
            <div class="flex items-center gap-1 mt-1">
              <button @click="p.quantity > 1 ? p.quantity-- : null" class="w-5 h-5 bg-slate-100 rounded text-slate-600 font-bold flex items-center justify-center">-</button>
              <input v-model="p.quantity" type="number" class="w-8 text-center text-[11px] font-bold border border-slate-200 rounded outline-none" />
              <button @click="p.quantity++" class="w-5 h-5 bg-slate-100 rounded text-slate-600 font-bold flex items-center justify-center">+</button>
              <span class="text-[10px] text-slate-500 ml-1">{{ p.unit }}</span>
            </div>
          </div>

          <div class="col-span-4">
            <select v-model="p.supplier" class="w-full h-8 px-1 rounded border border-slate-200 bg-slate-50 text-[10px] outline-none">
              <option value="">সাপ্লায়ার নেই</option>
              <option v-for="s in suppliersList" :key="s.id" :value="s.name">{{ s.name }}</option>
            </select>
            <p class="text-[8px] text-emerald-600 font-bold mt-0.5">সাজেস্টেড: {{ cheapestSuppliers[p.item_name]?.supplier || 'নেই' }}</p>
          </div>

          <div class="col-span-2 text-right">
            <span class="text-[9px] text-slate-400">দর ৳</span>
            <input v-model="p.max_price" type="number" class="w-12 text-right border-b border-slate-300 font-bold text-[12px] outline-none bg-transparent" />
          </div>

          <div class="col-span-1 text-right">
            <button @click="removeFromPlan(i)" class="text-red-400 text-sm active:scale-90">✕</button>
          </div>
        </div>
      </div>

      <div class="p-4 bg-[#0b172a] text-white flex justify-between items-center">
        <div>
          <p class="text-[12px] font-bold">সম্ভাব্য সর্বোচ্চ খরচ</p>
          <p class="text-[9px] text-white/60">(দাম কিছুটা কম হতে পারে)</p>
        </div>
        <p class="text-[20px] font-bold text-emerald-400">৳ {{ fmt(totalEstCost) }}</p>
      </div>
    </div>

    <!-- Floating Buttons -->
    <div class="fixed bottom-24 right-4 z-40 flex flex-col gap-2">
      <button @click="copyAsText" class="w-12 h-12 bg-white text-slate-700 rounded-full shadow-[0_4px_15px_rgba(0,0,0,0.15)] flex items-center justify-center active:scale-90 border border-slate-200">
        <span class="text-lg">📋</span>
      </button>
      <button @click="downloadImage" :disabled="isDownloading" class="w-14 h-14 bg-emerald-600 text-white rounded-full shadow-[0_4px_20px_rgba(16,185,129,0.5)] flex flex-col items-center justify-center active:scale-90 disabled:opacity-50">
        <span class="text-xl leading-none mb-0.5">📥</span>
        <span class="text-[9px] font-bold">সেভ</span>
      </button>
    </div>

    <transition name="fade">
      <div v-if="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">{{ toast }}</div>
    </transition>
  </div>

  <!-- ========================================== -->
  <!-- 🔥 IMAGE EXPORT VIEW (Hidden off-screen) -->
  <!-- ========================================== -->
  <div class="fixed -left-[9999px] top-0">
    <div ref="printArea" class="w-[400px] bg-white p-5 font-sans text-black">
      
    <!-- Header & Date -->
    <div class="text-center mb-3">
        <h1 class="text-[18px] font-bold text-slate-800">বাজারের তালিকা</h1>
        <p class="text-[11px] text-slate-500 mt-0.5">
        তারিখ: {{ new Date().toLocaleDateString('bn-BD', { day: 'numeric', month: 'long', year: 'numeric' }) }}
        </p>
    </div>

     <!-- Table Layout -->
    <table class="w-full border-collapse text-left">
    <thead>
        <tr class="border-b-2 border-slate-800 bg-slate-50">
        <th class="py-1.5 px-1 text-[12px] font-bold">পণ্য</th>
        <th class="py-1.5 px-1 text-[12px] font-bold text-center">পরিমাণ</th>
        <th class="py-1.5 px-1 text-[12px] font-bold">দোকান</th>
        <th class="py-1.5 px-1 text-[12px] font-bold text-right">সর্বোচ্চ দর</th>
        </tr>
    </thead>
        <tbody>
        <tr v-for="(p, i) in sortedPlanList" :key="i" class="border-b border-slate-300 border-dashed">
            
            <!-- Item Name & Bullet -->
            <td class="py-2 px-1">
            <div class="flex items-center gap-2">
                <div class="w-3.5 h-3.5 rounded-full border-2 border-slate-300 shrink-0"></div>
                <div class="flex flex-col justify-center leading-tight">
                <span class="text-[13px] font-bold text-slate-800">{{ p.item_name }}</span>
                <span v-if="p.max_price" class="text-[9px] font-medium text-slate-500 mt-0.5">({{ p.unit }} ৳{{ p.max_price }})</span>
                </div>
            </div>
            </td>

            <!-- Quantity -->
            <td class="py-2 px-1 text-[12px] font-medium text-slate-700 text-center align-middle">
            {{ p.quantity }} {{ p.unit }}
            </td>

            <!-- Supplier -->
            <td class="py-2 px-1 text-[12px] font-medium text-slate-700 align-middle truncate max-w-[90px]">
            {{ p.supplier || '—' }}
            </td>

            <!-- Total -->
            <td class="py-2 px-1 text-[13px] font-bold text-slate-900 text-right align-middle">
            ৳ {{ fmt(p.max_price * p.quantity) }}
            </td>
            
        </tr>
        </tbody>
    </table>

      <!-- Grand Total -->
      <div class="mt-4 pt-3 border-t-2 border-slate-800 flex justify-between items-center">
        <span class="text-[14px] font-bold">মোট:</span>
        <span class="text-[18px] font-black">৳ {{ fmt(totalEstCost) }}</span>
      </div>

    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>