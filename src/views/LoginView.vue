<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase' // উপরে ইমপোর্ট করুন
import { useAuth } from '../composables/useAuth'

const { login, signup, logout } = useAuth() // logout ইমপোর্ট করুন

const router = useRouter()

const isLogin = ref(true)
const loading = ref(false)
const errorMsg = ref('')

const form = ref({ email: '', password: '', name: '', restaurantName: '' })

async function handleSubmit() {
  loading.value = true
  errorMsg.value = ''
  try {
    if (isLogin.value) {
      await login(form.value.email, form.value.password)
      
      // 🔥 লগইনের পর স্ট্যাটাস চেক
      const { data: profileData } = await supabase.from('profiles').select('restaurant_id').eq('id', (await supabase.auth.getUser()).data.user.id).single()
      
      if (profileData?.restaurant_id) {
        const { data: restData } = await supabase.from('restaurants').select('status').eq('id', profileData.restaurant_id).single()
        
        if (restData && restData.status === 'inactive') {
          await logout()
          throw new Error('আপনার রেস্টুরেন্টটি বন্ধ আছে। সাপোর্টে যোগাযোগ করুন।')
        }
      }
      
    } else {
      await signup(form.value.email, form.value.password, form.value.name, form.value.restaurantName)
    }
    router.push('/')
  } catch (err) {
    errorMsg.value = err.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-[#f4f7fb] px-4">
    <div class="bg-white w-full max-w-sm rounded-2xl shadow-xl p-6 space-y-4">
      
      <div class="text-center mb-6">
        <h1 class="text-2xl font-bold text-[#0b172a]">RCR</h1>
        <p class="text-sm text-slate-500">{{ isLogin ? 'আপনার অ্যাকাউন্টে লগইন করুন' : 'নতুন রেস্টুরেন্ট রেজিস্ট্রেশন' }}</p>
      </div>

      <div v-if="errorMsg" class="bg-red-50 text-red-600 p-2 text-xs rounded border border-red-200">
        {{ errorMsg }}
      </div>

      <div v-if="!isLogin" class="space-y-3">
        <input v-model="form.name" type="text" placeholder="আপনার নাম" class="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm" />
        <input v-model="form.restaurantName" type="text" placeholder="রেস্টুরেন্টের নাম" class="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm" />
      </div>

      <input v-model="form.email" type="email" placeholder="ইমেইল" class="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm" />
      <input v-model="form.password" type="password" placeholder="পাসওয়ার্ড" class="w-full h-11 px-3 rounded-lg border border-slate-200 bg-slate-50 outline-none text-sm" />

      <button @click="handleSubmit" :disabled="loading" class="w-full h-11 bg-emerald-600 text-white font-bold rounded-lg active:scale-95 disabled:opacity-50">
        {{ loading ? 'অপেক্ষা করুন...' : (isLogin ? 'লগইন' : 'সাইনআপ') }}
      </button>

      <p class="text-center text-sm text-slate-500">
        {{ isLogin ? 'অ্যাকাউন্ট নেই?' : 'আগে থেকেই অ্যাকাউন্ট আছে?' }}
        <button @click="isLogin = !isLogin" class="text-emerald-600 font-bold ml-1">{{ isLogin ? 'সাইনআপ করুন' : 'লগইন করুন' }}</button>
      </p>
    </div>
  </div>
</template>