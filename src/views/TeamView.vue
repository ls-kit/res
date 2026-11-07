<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { supabase } from '../supabase'

const { profile, addStaff } = useAuth()

const team = ref([])
const loading = ref(true)
const showAddForm = ref(false)
const saving = ref(false)
const toast = ref('')

const form = ref({ name: '', email: '', password: '' })

async function loadTeam() {
  loading.value = true
  if (profile.value?.restaurant_id) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('restaurant_id', profile.value.restaurant_id)
    team.value = data || []
  }
  loading.value = false
}

function showToast(msg) {
  toast.value = msg
  setTimeout(() => toast.value = '', 2500)
}

async function handleAdd() {
  if (!form.value.name || !form.value.email || !form.value.password) return showToast('সব ঘর পূরণ করুন')
  saving.value = true
  try {
    await addStaff(form.value.email, form.value.password, form.value.name, profile.value.restaurant_id)
    showAddForm.value = false
    form.value = { name: '', email: '', password: '' }
    await loadTeam()
    showToast('✅ নতুন কর্মী যোগ হয়েছে')
  } catch (err) {
    showToast('এরর: ' + err.message)
  } finally {
    saving.value = false
  }
}

onMounted(loadTeam)
</script>

<template>
  <div class="px-3 pt-4 pb-6 space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-bold text-slate-800">আমার টিম</h2>
      <button @click="showAddForm = !showAddForm" class="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold active:scale-95">
        {{ showAddForm ? 'বাতিল' : '+ নতুন যোগ করুন' }}
      </button>
    </div>

    <!-- Add Form -->
    <div v-if="showAddForm" class="bg-white rounded-xl border border-slate-200 p-3 space-y-2 shadow-sm">
      <input v-model="form.name" type="text" placeholder="কর্মীর নাম" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[14px] outline-none" />
      <input v-model="form.email" type="email" placeholder="ইমেইল" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[14px] outline-none" />
      <input v-model="form.password" type="password" placeholder="পাসওয়ার্ড" class="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[14px] outline-none" />
      <button @click="handleAdd" :disabled="saving" class="w-full h-10 rounded-lg bg-emerald-600 text-white font-bold text-[13px] active:scale-95 disabled:opacity-50">
        {{ saving ? 'অপেক্ষা করুন...' : 'যোগ করুন' }}
      </button>
    </div>

    <!-- Team List -->
    <div v-if="loading" class="text-center text-slate-400 text-sm py-6">লোড হচ্ছে...</div>
    <div v-else class="space-y-2">
      <div v-for="member in team" :key="member.id" class="bg-white rounded-xl border border-slate-200 p-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
            {{ member.name?.charAt(0) || '?' }}
          </div>
          <div>
            <p class="text-[14px] font-bold text-slate-800">{{ member.name || 'নামহীন' }}</p>
            <p class="text-[11px] text-slate-500">{{ member.role === 'admin' ? 'মালিক' : 'কর্মী' }}</p>
          </div>
        </div>
        <span v-if="member.id === profile?.id" class="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">আপনি</span>
      </div>
    </div>
  </div>

  <transition name="fade">
    <div v-if="toast" class="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white text-sm px-4 py-2.5 rounded-full shadow-lg whitespace-nowrap">{{ toast }}</div>
  </transition>
</template>