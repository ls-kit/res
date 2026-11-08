<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'
import { useRouter } from 'vue-router'

const router = useRouter()
const restaurants = ref([])
const loading = ref(true)
const toast = ref('')

// ইউজার মডাল
const showUsersModal = ref(false)
const selectedRestaurant = ref(null)
const restaurantUsers = ref([])
const usersLoading = ref(false)

function showToast(msg) {
  toast.value = msg
  setTimeout(() => (toast.value = ''), 2500)
}

async function loadRestaurants() {
  loading.value = true
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .order('created_at', { ascending: false })
    
  if (!error) restaurants.value = data || []
  loading.value = false
}



const showGlobalItems = ref(false) // Collapse/Expand স্টেট
const bulkInput = ref('') // Bulk Add এর জন্য
/* ---------- Global Items Logic ---------- */
const globalItems = ref([])
const newGlobalItem = ref({ name: '', unit: 'কেজি' })
const globalUnits = ['কেজি', 'পিস', 'লিটার', 'প্যাকেট', 'গ্রাম']

async function loadGlobalItems() {
  const { data } = await supabase.from('items').select('*').eq('is_global', true).order('name')
  globalItems.value = data || []
}

async function addGlobalItem() {
  if (!newGlobalItem.value.name.trim()) return showToast('পণ্যের নাম দিন')
  
  const { error } = await supabase.from('items').insert({
    name: newGlobalItem.value.name.trim(),
    default_unit: newGlobalItem.value.unit,
    is_global: true,
    restaurant_id: null
  })
  
  if (error) {
    if (error.code === '23505') return showToast('এই পণ্যটি আগেই আছে!')
    return showToast('যোগ হয়নি: ' + error.message)
  }
  
  newGlobalItem.value.name = ''
  await loadGlobalItems()
  showToast('✅ নতুন পণ্য যোগ হয়েছে')
}

async function removeGlobalItem(id) {
  if (!confirm('পণ্যটি রেডি লিস্ট থেকে মুছবেন?')) return
  await supabase.from('items').delete().eq('id', id)
  await loadGlobalItems()
  showToast('✅ মুছে ফেলা হয়েছে')
}
async function addBulkGlobalItems() {
  if (!bulkInput.value.trim()) return
  // কমা দিয়ে আলাদা করা নামগুলোকে ভাগ করা
  const names = bulkInput.value.split(',').map(n => n.trim()).filter(n => n)
  
  const payloads = names.map(name => ({
    name,
    default_unit: 'কেজি',
    is_global: true,
    restaurant_id: null
  }))

  const { error } = await supabase.from('items').insert(payloads)
  
  if (error) {
    if (error.code === '23505') return showToast('কিছু পণ্য আগেই আছে, বাকিগুলো চেক করুন!')
    return showToast('যোগ হয়নি: ' + error.message)
  }
  
  bulkInput.value = ''
  await loadGlobalItems()
  showToast(`✅ ${names.length} টি পণ্য যোগ হয়েছে`)
}




// স্ট্যাটাস পরিবর্তন (Active/Inactive)
async function toggleStatus(r) {
  const newStatus = r.status === 'active' ? 'inactive' : 'active'
  const { error } = await supabase
    .from('restaurants')
    .update({ status: newStatus })
    .eq('id', r.id)

  if (error) return showToast('স্ট্যাটাস পরিবর্তন ব্যর্থ: ' + error.message)
  
  r.status = newStatus
  showToast(`✅ ${r.name} এখন ${newStatus === 'active' ? 'সক্রিয়' : 'নিষ্ক্রিয়'}`)
}

// রেস্টুরেন্টে প্রবেশ
function enterRestaurant(r) {
  if (r.status === 'inactive') return showToast('⚠️ এই রেস্টুরেন্টটি নিষ্ক্রিয় আছে!')
  localStorage.setItem('viewing_restaurant_id', r.id)
  localStorage.setItem('viewing_restaurant_name', r.name)
  router.push('/')
}

// ইউজার লিস্ট দেখা (ইমেইল ও লাস্ট লগইন সহ)
async function viewUsers(r) {
  selectedRestaurant.value = r
  showUsersModal.value = true
  usersLoading.value = true
  
  // SQL ফাংশন কল করা
  const { data, error } = await supabase.rpc('get_users_with_email', { rest_id: r.id })

  if (error) {
    showToast('ইউজার লোড হয়নি: ' + error.message)
    restaurantUsers.value = []
  } else {
    // last_sign_in_at কে updated_at এর জায়গায় ম্যাপ করে দেওয়া হলো যাতে নিচের টেমপ্লেট কাজ করে
    restaurantUsers.value = data.map(u => ({
      ...u,
      updated_at: u.last_sign_in_at
    })) || []
  }
  usersLoading.value = false
}

// টাইম ফরম্যাট
function formatTime(iso) {
  if (!iso) return 'কখনো লগইন করেনি'
  return new Intl.DateTimeFormat('bn-BD', { dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(iso))
}

onMounted(async () => {
  await loadRestaurants()
  await loadGlobalItems()
})
</script>

<template>
  <div class="px-3 pt-4 pb-6 space-y-4">
    
    <!-- Header -->
    <div class="bg-[#0b172a] rounded-xl p-4 text-white shadow-lg">
      <h2 class="text-lg font-bold">সুপার অ্যাডমিন প্যানেল</h2>
      <p class="text-xs text-white/70 mt-1">সিস্টেমের সব রেস্টুরেন্ট নিয়ন্ত্রণ করুন</p>
    </div>

    <div v-if="loading" class="text-center text-slate-400 py-6 text-sm">লোড হচ্ছে...</div>
    <div v-else-if="!restaurants.length" class="text-center py-10">
      <p class="text-slate-500 text-sm">কোনো রেস্টুরেন্ট পাওয়া যায়নি</p>
    </div>
    
    <div v-else class="space-y-3">
      <div v-for="r in restaurants" :key="r.id" class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <!-- Restaurant Info -->
        <div class="p-3 flex items-center justify-between border-b border-slate-100" :class="r.status === 'inactive' ? 'bg-red-50/40' : ''">
          <div>
            <div class="flex items-center gap-1.5">
              <p class="text-[14px] font-bold text-slate-800">{{ r.name }}</p>
              <span v-if="r.status === 'inactive'" class="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">নিষ্ক্রিয়</span>
              <span v-else class="text-[9px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded font-bold">সক্রিয়</span>
            </div>
            <p class="text-[10px] text-slate-400 mt-0.5">আইডি: {{ r.id.split('-')[0] }}</p>
          </div>
          
          <div class="flex gap-1.5">
            <button @click="viewUsers(r)" class="px-2 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-[10px] font-bold active:scale-95 border border-blue-100">
              👥 ইউজার
            </button>
            <button @click="toggleStatus(r)" class="px-2 py-1.5 rounded-lg text-[10px] font-bold active:scale-95 border" :class="r.status === 'active' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'">
              {{ r.status === 'active' ? '⏸️ বন্ধ' : '▶️ চালু' }}
            </button>
          </div>
        </div>
        
        <!-- Action Bar -->
        <div class="px-3 py-2 bg-slate-50 flex items-center justify-between">
          <p class="text-[10px] text-slate-500">তৈরি: {{ formatTime(r.created_at) }}</p>
          <button @click="enterRestaurant(r)" :disabled="r.status === 'inactive'" class="px-3 py-1 rounded-md bg-white border border-slate-200 text-slate-700 text-[11px] font-bold active:scale-95 disabled:opacity-50">
            প্রবেশ করুন ›
          </button>
        </div>
      </div>
    </div>



<!-- Global Items Section -->
<div class="bg-white rounded-xl border border-slate-200 shadow-sm mt-4 mb-8 overflow-hidden">
  <!-- Header with Collapse -->
  <button @click="showGlobalItems = !showGlobalItems" class="w-full p-4 flex items-center justify-between bg-white active:bg-slate-50">
    <div class="flex items-center gap-2 text-left">
      <div class="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-600">✨</div>
      <div>
        <p class="text-[13px] font-bold text-slate-800">কমন পণ্য তালিকা ({{ globalItems.length }})</p>
        <p class="text-[10px] text-slate-500">রেস্টুরেন্টগুলো এখান থেকে পণ্য বেছে নিতে পারবে</p>
      </div>
    </div>
    <span class="text-slate-400 text-lg transition-transform duration-300" :class="showGlobalItems ? 'rotate-180' : ''">▼</span>
  </button>

  <!-- Expanded Content -->
  <div v-if="showGlobalItems" class="p-4 border-t border-slate-100 space-y-3 bg-slate-50/50">
    
    <!-- Bulk Add -->
    <div>
      <p class="text-[11px] font-bold text-slate-600 mb-1">বাল্ক অ্যাড (একসাথে অনেক পণ্য)</p>
      <div class="flex gap-1.5">
        <input v-model="bulkInput" type="text" placeholder="আলু, পেঁয়াজ, রসুন (কমা দিয়ে লিখুন)" class="flex-1 h-9 px-2 rounded-md border border-slate-200 bg-white text-[12px] outline-none focus:border-blue-500" />
        <button @click="addBulkGlobalItems" class="h-9 px-3 bg-blue-600 text-white rounded-md text-[11px] font-bold active:scale-95">যোগ</button>
      </div>
    </div>

    <!-- Single Add -->
    <div>
      <p class="text-[11px] font-bold text-slate-600 mb-1">একক অ্যাড</p>
      <div class="flex gap-1.5">
        <input v-model="newGlobalItem.name" type="text" placeholder="পণ্যের নাম..." class="flex-1 h-9 px-2 rounded-md border border-slate-200 bg-white text-[12px] outline-none focus:border-blue-500" />
        <select v-model="newGlobalItem.unit" class="h-9 px-1 rounded-md border border-slate-200 bg-white text-[12px] outline-none">
          <option v-for="u in globalUnits" :key="u" :value="u">{{ u }}</option>
        </select>
        <button @click="addGlobalItem" class="h-9 px-3 bg-[#0b172a] text-white rounded-md text-[11px] font-bold active:scale-95">+</button>
      </div>
    </div>

    <!-- Item List with Delete -->
    <div class="pt-2 border-t border-slate-200">
      <div class="flex flex-wrap gap-1.5 max-h-40 overflow-auto pb-1">
        <div v-for="g in globalItems" :key="g.id" class="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-[11px] flex items-center gap-1.5 text-slate-700 shadow-sm">
          <span>{{ g.name }} <span class="text-[9px] text-slate-400">({{ g.default_unit }})</span></span>
          <button @click="removeGlobalItem(g.id)" class="text-red-400 hover:text-red-600 font-bold ml-0.5">✕</button>
        </div>
        <p v-if="!globalItems.length" class="text-[11px] text-slate-400 italic">কোনো কমন পণ্য নেই</p>
      </div>
    </div>
  </div>
</div>


  </div>

  <!-- Users Modal -->
  <div v-if="showUsersModal" class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm" @click.self="showUsersModal = false">
    <div class="bg-white rounded-2xl w-full max-w-sm shadow-2xl flex flex-col max-h-[85vh]">
      <div class="p-4 border-b border-slate-100 flex justify-between items-center">
        <div>
          <p class="text-[14px] font-bold text-slate-800">ইউজার তালিকা</p>
          <p class="text-[11px] text-slate-500">{{ selectedRestaurant?.name }}</p>
        </div>
        <button @click="showUsersModal = false" class="text-slate-400 text-lg">✕</button>
      </div>
      
      <div class="p-3 overflow-auto flex-1 bg-slate-50">
        <div v-if="usersLoading" class="text-center text-slate-400 text-sm py-6">লোড হচ্ছে...</div>
        <div v-else-if="!restaurantUsers.length" class="text-center text-slate-400 text-sm py-6">কোনো ইউজার নেই</div>
        <div v-else class="space-y-2">
            <div v-for="u in restaurantUsers" :key="u.id" class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
            <div class="flex justify-between items-start">
                <div>
                <p class="text-[13px] font-bold text-slate-800">{{ u.name || 'নামহীন' }}</p>
                <!-- 🔥 ইমেইল এখানে দেখাবে -->
                <p class="text-[11px] text-slate-500 mt-0.5">✉️ {{ u.email || 'কোনো ইমেইল নেই' }}</p>
                <p class="text-[10px] text-emerald-600 font-medium mt-0.5">{{ u.role === 'admin' ? 'মালিক' : 'কর্মী' }}</p>
                </div>
                <span class="text-[9px] px-1.5 py-0.5 rounded" :class="u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'">
                {{ u.role.toUpperCase() }}
                </span>
            </div>
            <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between">
                <p class="text-[9px] text-slate-500">শেষ লগইন:</p>
                <p class="text-[10px] text-slate-700 font-medium">{{ formatTime(u.updated_at) }}</p>
            </div>
            </div>
        </div>
      </div>
      
      <div class="p-3 border-t border-slate-100">
        <button @click="showUsersModal = false" class="w-full py-2 bg-slate-100 text-slate-700 font-bold rounded-lg text-[13px]">বন্ধ করুন</button>
      </div>
    </div>
  </div>

  <!-- Toast -->
  <transition name="fade">
    <div v-if="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">{{ toast }}</div>
  </transition>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>