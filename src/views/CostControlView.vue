<script setup>
import { ref, computed, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useAuth } from '../composables/useAuth'

const { profile } = useAuth()
const loading = ref(true)
const purchases = ref([])
const activeTab = ref('price_alert') // price_alert, supplier_compare, food_cost

function getActiveRestaurantId() {
  const overriddenId = localStorage.getItem('viewing_restaurant_id')
  if (profile.value?.role === 'superadmin' && overriddenId) return overriddenId
  return profile.value?.restaurant_id
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

  // গত ৩০ দিনের ডেটা আনছি
  const past30Days = new Date()
  past30Days.setDate(past30Days.getDate() - 30)

  const { data } = await supabase
    .from('purchases')
    .select('*')
    .eq('restaurant_id', rid)
    .gte('purchase_date', past30Days.toISOString().slice(0, 10))
    .order('purchase_date', { ascending: true })

  purchases.value = data || []
  loading.value = false
}

/* =========================================
   1. Price Increase Alerts (কোন পণ্যের দাম বাড়ছে)
   ========================================= */
const priceAlerts = computed(() => {
  const grouped = {}
  purchases.value.forEach(p => {
    if (!p.unit_price) return
    if (!grouped[p.item_name]) grouped[p.item_name] = []
    grouped[p.item_name].push(p)
  })

  const alerts = []
  for (const [item, list] of Object.entries(grouped)) {
    if (list.length < 2) continue
    
    // তারিখ অনুযায়ী সাজানো
    list.sort((a, b) => new Date(a.purchase_date) - new Date(b.purchase_date))
    
    const firstPrice = Number(list[0].unit_price)
    const lastPrice = Number(list[list.length - 1].unit_price)
    const diff = lastPrice - firstPrice

    if (diff > 0) {
      alerts.push({
        item,
        firstPrice,
        lastPrice,
        diff,
        percent: Math.round((diff / firstPrice) * 100),
        unit: list[0].unit,
        lastDate: list[list.length - 1].purchase_date
      })
    }
  }
  return alerts.sort((a, b) => b.percent - a.percent) // সবচেয়ে বেশি বাড়া দাম উপরে
})

/* =========================================
   2. Supplier Price Comparison (কে কম দামে দিচ্ছে)
   ========================================= */
const selectedCompareItem = ref('')
const uniqueItems = computed(() => {
  return [...new Set(purchases.value.map(p => p.item_name))]
})

const supplierComparison = computed(() => {
  if (!selectedCompareItem.value) return []
  
  const relevant = purchases.value.filter(p => p.item_name === selectedCompareItem.value && p.unit_price)
  
  const map = {}
  relevant.forEach(p => {
    const sup = p.supplier || 'সাপ্লায়ার ছাড়া'
    if (!map[sup]) map[sup] = { totalPrice: 0, count: 0, unit: p.unit }
    map[sup].totalPrice += Number(p.unit_price)
    map[sup].count += 1
  })

  return Object.entries(map).map(([name, data]) => ({
    name,
    avgPrice: data.totalPrice / data.count,
    count: data.count,
    unit: data.unit
  })).sort((a, b) => a.avgPrice - b.avgPrice) // কম দাম আগে
})

/* =========================================
   3. Top Purchased Items (সবচেয়ে বেশি খরচ)
   ========================================= */
const topItems = computed(() => {
  const map = {}
  purchases.value.forEach(p => {
    if (!map[p.item_name]) map[p.item_name] = 0
    map[p.item_name] += Number(p.total_price)
  })
  return Object.entries(map)
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
})

onMounted(loadData)
</script>

<template>
  <div class="px-3 pt-4 pb-6 space-y-4 bg-[#f4f7fb] min-h-screen">
    
    <!-- Header -->
    <div class="bg-gradient-to-br from-[#0b172a] to-slate-800 rounded-2xl p-4 text-white shadow-lg relative overflow-hidden">
      <div class="absolute -right-4 -top-4 text-6xl opacity-10">📉</div>
      <h2 class="text-[16px] font-bold">Cost Control & Analysis</h2>
      <p class="text-[11px] text-white/70 mt-1">ডেটা বিশ্লেষণ করে খরচ কমান</p>
    </div>

    <!-- Tabs -->
    <div class="grid grid-cols-3 bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
      <button @click="activeTab = 'price_alert'" class="h-9 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'price_alert' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">দাম বেড়েছে</button>
      <button @click="activeTab = 'supplier_compare'" class="h-9 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'supplier_compare' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">দাম তুলনা</button>
      <button @click="activeTab = 'food_cost'" class="h-9 rounded-lg text-[11px] font-bold transition" :class="activeTab === 'food_cost' ? 'bg-[#0b172a] text-white' : 'text-slate-500'">ফুড কস্ট</button>
    </div>

    <div v-if="loading" class="text-center text-slate-400 py-10 text-sm">লোড হচ্ছে...</div>

    <div v-else class="space-y-4">
      
      <!-- ================= TAB 1: PRICE ALERTS ================= -->
      <template v-if="activeTab === 'price_alert'">
        
        <!-- Alert Card -->
        <div v-if="priceAlerts.length" class="bg-red-50 border border-red-200 rounded-xl p-3 flex gap-2 shadow-sm">
          <div class="text-xl text-red-500 shrink-0">🚨</div>
          <div>
            <p class="text-[12px] font-bold text-red-900">সতর্কতা!</p>
            <p class="text-[11px] text-red-700 mt-0.5">গত ৩০ দিনে আপনার <strong>{{ priceAlerts.length }} টি</strong> পণ্যের দাম বেড়েছে। বেশি দামে কেনা এড়াতে নিচের তালিকা দেখুন।</p>
          </div>
        </div>
        <div v-else class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p class="text-[12px] font-bold text-emerald-800">✅ গত ৩০ দিনে কোনো পণ্যের দাম বাড়েনি!</p>
        </div>

        <!-- Alert List -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">দাম বাড়ার তালিকা</div>
          <div class="divide-y divide-slate-100">
            <div v-for="(a, i) in priceAlerts" :key="i" class="p-3 flex justify-between items-center">
              <div>
                <p class="text-[13px] font-bold text-slate-800">{{ a.item }}</p>
                <p class="text-[10px] text-slate-500 mt-0.5">আগে: ৳{{ a.firstPrice }} <span class="text-red-400">→</span> এখন: ৳{{ a.lastPrice }} / {{ a.unit }}</p>
              </div>
              <div class="text-right">
                <span class="inline-block bg-red-100 text-red-700 text-[11px] font-bold px-2 py-0.5 rounded">
                  +{{ a.percent }}%
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Top Spend Items -->
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="px-3 py-2 bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600">সর্বোচ্চ বাজেটের পণ্য (গত ৩০ দিন)</div>
          <div class="divide-y divide-slate-100">
            <div v-for="(t, i) in topItems" :key="i" class="p-3 flex justify-between items-center">
              <p class="text-[12px] font-medium text-slate-800">{{ i+1 }}. {{ t.name }}</p>
              <p class="text-[12px] font-bold text-slate-800">৳ {{ fmt(t.total) }}</p>
            </div>
          </div>
        </div>
      </template>

      <!-- ================= TAB 2: SUPPLIER COMPARISON ================= -->
      <template v-if="activeTab === 'supplier_compare'">
        <div class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm space-y-3">
          <p class="text-[12px] font-bold text-slate-800">কোন পণ্য কার কাছ থেকে কম দামে কিনছেন?</p>
          <select v-model="selectedCompareItem" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-[13px]">
            <option value="" disabled>পণ্য বাছাই করুন</option>
            <option v-for="item in uniqueItems" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>

        <div v-if="selectedCompareItem && supplierComparison.length" class="space-y-2">
          <div v-for="(sup, i) in supplierComparison" :key="i" class="bg-white rounded-xl border border-slate-200 p-3 shadow-sm flex items-center justify-between" :class="i === 0 ? 'border-emerald-400 bg-emerald-50/30' : ''">
            <div>
              <div class="flex items-center gap-1.5">
                <p class="text-[13px] font-bold text-slate-800">{{ sup.name }}</p>
                <span v-if="i === 0" class="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1.5 py-0.5 rounded">সবচেয়ে সস্তা</span>
              </div>
              <p class="text-[10px] text-slate-500 mt-0.5">{{ sup.count }} বার কেনা হয়েছে</p>
            </div>
            <div class="text-right">
              <p class="text-[14px] font-bold" :class="i === 0 ? 'text-emerald-600' : 'text-slate-700'">৳ {{ fmt(sup.avgPrice) }}</p>
              <p class="text-[9px] text-slate-400">গড় দর / {{ sup.unit }}</p>
            </div>
          </div>
        </div>
        <div v-else-if="selectedCompareItem" class="text-center py-8 text-slate-400 text-sm">
          এই পণ্যের কোনো ডেটা পাওয়া যায়নি।
        </div>
      </template>

      <!-- ================= TAB 3: FOOD COST (Preview) ================= -->
      <template v-if="activeTab === 'food_cost'">
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center space-y-3">
          <div class="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto text-3xl">🧑‍🍳</div>
          <h3 class="text-[15px] font-bold text-slate-800">Food Cost & Yield Analysis</h3>
          <p class="text-[12px] text-slate-500 leading-relaxed">আপনার রেস্টুরেন্টের প্রকৃত ফুড কস্ট, কাঁচামালের অপচয় (Waste) এবং Yield (যেমন: ১০ কেজি মুরগি থেকে ৭.৫ কেজি মাংস পাওয়া) হিসাব করতে এই ফিচারটি আসছে।</p>
          
          <div class="bg-slate-50 rounded-lg p-3 text-left mt-2 border border-slate-100">
            <p class="text-[11px] font-bold text-slate-700 mb-1">কীভাবে কাজ করবে?</p>
            <ul class="text-[10px] text-slate-600 space-y-1 list-disc pl-3">
              <li>Opening Stock + Purchase - Closing Stock</li>
              <li>Waste Entry (নষ্ট হওয়া পণ্যের হিসাব)</li>
              <li>Yield Entry (কাঁচা থেকে ব্যবহারযোগ্য পরিমাণ)</li>
            </ul>
          </div>
          
          <button class="w-full h-10 rounded-lg bg-slate-100 text-slate-400 font-bold text-[12px] cursor-not-allowed mt-2">
            🔒 ফিচারটি শীঘ্রই আসছে
          </button>
        </div>
      </template>

    </div>
  </div>
</template>