import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, AlertCircle, Calendar, Mail, Phone, Globe, Instagram, Twitter, Loader2, Sparkles, Crown, Shield, DollarSign, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { type User } from '../lib/api'

interface CreatorApplicationPageProps {
  user: User
  onBack: () => void
  onSuccess: () => void
}

const CONTENT_CATEGORIES = [
  { id: 'lifestyle', name: 'Lifestyle', icon: '✨' },
  { id: 'fitness', name: 'Fitness', icon: '💪' },
  { id: 'fashion', name: 'Fashion', icon: '👗' },
  { id: 'art', name: 'Art', icon: '🎨' },
  { id: 'music', name: 'Music', icon: '🎵' },
  { id: 'gaming', name: 'Gaming', icon: '🎮' },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'cooking', name: 'Cooking', icon: '🍳' },
  { id: 'photography', name: 'Photography', icon: '📷' },
  { id: 'cosplay', name: 'Cosplay', icon: '🎭' },
  { id: 'asmr', name: 'ASMR', icon: '🎧' },
  { id: 'adult', name: 'Adult (18+)', icon: '🔞', nsfw: true },
]

const STEPS = [
  { id: 1, title: 'About You', icon: '👤' },
  { id: 2, title: 'Content', icon: '🎬' },
  { id: 3, title: 'Socials', icon: '🔗' },
  { id: 4, title: 'Terms', icon: '✅' },
]

export default function CreatorApplicationPage({ user, onBack, onSuccess }: CreatorApplicationPageProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Form data
  const [formData, setFormData] = useState({
    legalName: user.first_name + ' ' + (user.last_name || ''),
    dateOfBirth: '',
    country: '',
    city: '',
    email: '',
    phone: '',
    contentType: 'sfw' as 'sfw' | 'nsfw',
    isAiGenerated: false,
    categories: [] as string[],
    contentDescription: '',
    instagram: '',
    twitter: '',
    tiktok: '',
    otherPlatforms: '',
    ageConfirmed: false,
    termsAccepted: false,
    contentPolicyAccepted: false,
    payoutTermsAccepted: false,
  })

  const updateForm = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  const toggleCategory = (catId: string) => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(catId)
        ? prev.categories.filter(c => c !== catId)
        : [...prev.categories, catId]
    }))
  }

  const validateStep = (stepNum: number): boolean => {
    switch (stepNum) {
      case 1:
        if (!formData.legalName.trim()) {
          setError('Please enter your legal name')
          return false
        }
        if (!formData.dateOfBirth) {
          setError('Please enter your date of birth')
          return false
        }
        // Check if 18+
        const birthDate = new Date(formData.dateOfBirth)
        const today = new Date()
        let age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--
        }
        if (age < 18) {
          setError('You must be at least 18 years old to become a creator')
          return false
        }
        if (!formData.country.trim()) {
          setError('Please enter your country')
          return false
        }
        if (!formData.email.trim() || !formData.email.includes('@')) {
          setError('Please enter a valid email address')
          return false
        }
        return true
      case 2:
        if (formData.categories.length === 0) {
          setError('Please select at least one content category')
          return false
        }
        return true
      case 3:
        return true // Social links are optional
      case 4:
        if (!formData.ageConfirmed) {
          setError('You must confirm you are 18 years or older')
          return false
        }
        if (!formData.termsAccepted) {
          setError('You must accept the Terms of Service')
          return false
        }
        if (!formData.contentPolicyAccepted) {
          setError('You must accept the Content Policy')
          return false
        }
        if (!formData.payoutTermsAccepted) {
          setError('You must accept the Payout Terms')
          return false
        }
        return true
      default:
        return true
    }
  }

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(prev => Math.min(prev + 1, 4))
    }
  }

  const prevStep = () => {
    setStep(prev => Math.max(prev - 1, 1))
    setError('')
  }

  const submitApplication = async () => {
    if (!validateStep(4)) return

    setSubmitting(true)
    setError('')

    try {
      const { error: dbError } = await supabase
        .from('creator_applications')
        .insert({
          user_id: user.telegram_id,
          legal_name: formData.legalName,
          date_of_birth: formData.dateOfBirth,
          country: formData.country,
          city: formData.city || null,
          email: formData.email,
          phone: formData.phone || null,
          content_type: formData.contentType,
          is_ai_generated: formData.isAiGenerated,
          content_categories: formData.categories,
          content_description: formData.contentDescription || null,
          instagram_url: formData.instagram || null,
          twitter_url: formData.twitter || null,
          tiktok_url: formData.tiktok || null,
          other_platforms: formData.otherPlatforms || null,
          age_confirmed: formData.ageConfirmed,
          terms_accepted: formData.termsAccepted,
          content_policy_accepted: formData.contentPolicyAccepted,
          payout_terms_accepted: formData.payoutTermsAccepted,
          status: 'pending',
        })

      if (dbError) throw dbError

      // Update user's application status
      await supabase
        .from('users')
        .update({
          application_status: 'pending',
          applied_at: new Date().toISOString()
        })
        .eq('telegram_id', user.telegram_id)

      // Log terms acceptance
      await supabase
        .from('terms_acceptance_log')
        .insert({
          user_id: user.telegram_id,
          terms_version: '1.0',
        })

      onSuccess()
    } catch (err: any) {
      console.error('Application error:', err)
      if (err.code === '23505') {
        setError('You have already submitted an application')
      } else {
        setError('Failed to submit application. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header with gradient */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-yellow-400" />
            <span className="font-bold">Become a Creator</span>
          </div>
          <div className="w-9" />
        </div>
      </div>

      {/* Hero Section */}
      <div className="pt-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-600/20 via-pink-500/10 to-transparent" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-gradient-to-r from-purple-500/30 to-pink-500/30 rounded-full blur-[100px]" />

        <div className="relative px-6 py-8 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 flex items-center justify-center shadow-lg shadow-orange-500/30"
          >
            <Sparkles className="w-10 h-10 text-white" />
          </motion.div>
          <h1 className="text-2xl font-bold mb-2">Start Your Creator Journey</h1>
          <p className="text-white/60 text-sm">Monetize your content and build your community</p>
        </div>

        {/* Stats Preview */}
        <div className="flex justify-center gap-6 px-6 pb-6">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-green-500/20 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
            <div className="text-xs text-white/50">Earn 85%</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <Shield className="w-6 h-6 text-blue-400" />
            </div>
            <div className="text-xs text-white/50">Safe & Secure</div>
          </div>
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-xl bg-purple-500/20 flex items-center justify-center">
              <Star className="w-6 h-6 text-purple-400" />
            </div>
            <div className="text-xs text-white/50">Telegram Stars</div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="px-4 pb-4">
        <div className="flex justify-between items-center">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <motion.div
                animate={{
                  scale: step === s.id ? 1.1 : 1,
                  backgroundColor: step > s.id ? '#22c55e' : step === s.id ? '#a855f7' : 'rgba(255,255,255,0.1)'
                }}
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold relative"
              >
                {step > s.id ? (
                  <Check className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-lg">{s.icon}</span>
                )}
                {step === s.id && (
                  <motion.div
                    layoutId="activeStep"
                    className="absolute inset-0 rounded-full border-2 border-purple-400"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                )}
              </motion.div>
              {idx < STEPS.length - 1 && (
                <div className={`w-8 sm:w-12 h-0.5 mx-1 transition-colors ${step > s.id ? 'bg-green-500' : 'bg-white/10'}`} />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-2 px-1">
          {STEPS.map(s => (
            <span key={s.id} className={`text-[10px] ${step >= s.id ? 'text-white/70' : 'text-white/30'}`}>
              {s.title}
            </span>
          ))}
        </div>
      </div>

      {/* Form Content */}
      <div className="px-4 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <h2 className="text-lg font-bold mb-1">Personal Information</h2>
                  <p className="text-sm text-white/50">Required for verification. Kept private.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Legal Full Name *</label>
                    <input
                      type="text"
                      value={formData.legalName}
                      onChange={(e) => updateForm('legalName', e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                      placeholder="As it appears on your ID"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Date of Birth *</label>
                    <div className="relative">
                      <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="date"
                        value={formData.dateOfBirth}
                        onChange={(e) => updateForm('dateOfBirth', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all [color-scheme:dark]"
                        max={new Date(Date.now() - 18 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-1.5 ml-1">Must be 18 or older</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">Country *</label>
                      <div className="relative">
                        <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                        <input
                          type="text"
                          value={formData.country}
                          onChange={(e) => updateForm('country', e.target.value)}
                          className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                          placeholder="Country"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/70 mb-2">City</label>
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) => updateForm('city', e.target.value)}
                        className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="City"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Email Address *</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => updateForm('email', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="your@email.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateForm('phone', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="+1 234 567 8900"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <h2 className="text-lg font-bold mb-1">Content Type</h2>
                  <p className="text-sm text-white/50">What kind of content will you create?</p>
                </div>

                {/* Content Rating */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">Content Rating *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateForm('contentType', 'sfw')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        formData.contentType === 'sfw'
                          ? 'border-green-500 bg-green-500/20'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="text-3xl mb-2">🌟</div>
                      <div className="font-bold">SFW</div>
                      <div className="text-xs text-white/50">Safe for work</div>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateForm('contentType', 'nsfw')}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        formData.contentType === 'nsfw'
                          ? 'border-pink-500 bg-pink-500/20'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="text-3xl mb-2">🔞</div>
                      <div className="font-bold">NSFW</div>
                      <div className="text-xs text-white/50">Adult (18+)</div>
                    </motion.button>
                  </div>
                  {formData.contentType === 'nsfw' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 p-3 bg-pink-500/10 border border-pink-500/20 rounded-xl text-sm text-pink-200"
                    >
                      <AlertCircle className="w-4 h-4 inline mr-2" />
                      Adult content requires strict age verification
                    </motion.div>
                  )}
                </div>

                {/* AI Generated */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">Content Source *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateForm('isAiGenerated', false)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        !formData.isAiGenerated
                          ? 'border-blue-500 bg-blue-500/20'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="text-3xl mb-2">📸</div>
                      <div className="font-bold">Real</div>
                      <div className="text-xs text-white/50">Photos & videos</div>
                    </motion.button>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => updateForm('isAiGenerated', true)}
                      className={`p-4 rounded-2xl border-2 text-center transition-all ${
                        formData.isAiGenerated
                          ? 'border-purple-500 bg-purple-500/20'
                          : 'border-white/10 bg-white/5'
                      }`}
                    >
                      <div className="text-3xl mb-2">🤖</div>
                      <div className="font-bold">AI</div>
                      <div className="text-xs text-white/50">Generated</div>
                    </motion.button>
                  </div>
                </div>

                {/* Categories */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">Categories * (select all that apply)</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CONTENT_CATEGORIES.filter(c => formData.contentType === 'nsfw' || !c.nsfw).map((cat) => (
                      <motion.button
                        key={cat.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleCategory(cat.id)}
                        className={`p-3 rounded-xl border text-center transition-all ${
                          formData.categories.includes(cat.id)
                            ? 'border-purple-500 bg-purple-500/20 text-white'
                            : 'border-white/10 bg-white/5 text-white/70'
                        }`}
                      >
                        <span className="text-xl block mb-1">{cat.icon}</span>
                        <span className="text-xs">{cat.name}</span>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-2">Describe Your Content</label>
                  <textarea
                    value={formData.contentDescription}
                    onChange={(e) => updateForm('contentDescription', e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all resize-none"
                    rows={3}
                    placeholder="Tell us about your content..."
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <h2 className="text-lg font-bold mb-1">Social Media Links</h2>
                  <p className="text-sm text-white/50">Optional but speeds up approval</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Instagram</label>
                    <div className="relative">
                      <Instagram className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-pink-400" />
                      <input
                        type="url"
                        value={formData.instagram}
                        onChange={(e) => updateForm('instagram', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-pink-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="instagram.com/username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Twitter/X</label>
                    <div className="relative">
                      <Twitter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                      <input
                        type="url"
                        value={formData.twitter}
                        onChange={(e) => updateForm('twitter', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-blue-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="twitter.com/username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">TikTok</label>
                    <div className="relative">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white flex items-center justify-center text-lg">🎵</div>
                      <input
                        type="url"
                        value={formData.tiktok}
                        onChange={(e) => updateForm('tiktok', e.target.value)}
                        className="w-full pl-12 pr-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all"
                        placeholder="tiktok.com/@username"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">Other Platforms</label>
                    <textarea
                      value={formData.otherPlatforms}
                      onChange={(e) => updateForm('otherPlatforms', e.target.value)}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:border-purple-500 focus:bg-white/10 focus:outline-none transition-all resize-none"
                      rows={2}
                      placeholder="YouTube, OnlyFans, Patreon..."
                    />
                  </div>
                </div>

                <div className="p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl border border-purple-500/20">
                  <p className="text-sm text-white/70">
                    💡 Having verified social media helps fast-track your approval
                  </p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                  <h2 className="text-lg font-bold mb-1">Terms & Agreements</h2>
                  <p className="text-sm text-white/50">Please review and accept all terms</p>
                </div>

                <div className="space-y-3">
                  {/* Age Confirmation */}
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => updateForm('ageConfirmed', !formData.ageConfirmed)}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      formData.ageConfirmed ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      formData.ageConfirmed ? 'border-green-500 bg-green-500' : 'border-white/30'
                    }`}>
                      {formData.ageConfirmed && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Age Confirmation *</div>
                      <div className="text-sm text-white/50">
                        I confirm I am at least 18 years old
                      </div>
                    </div>
                  </motion.button>

                  {/* Terms of Service */}
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => updateForm('termsAccepted', !formData.termsAccepted)}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      formData.termsAccepted ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      formData.termsAccepted ? 'border-green-500 bg-green-500' : 'border-white/30'
                    }`}>
                      {formData.termsAccepted && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Terms of Service *</div>
                      <div className="text-sm text-white/50">
                        I agree to the Creator Terms of Service
                      </div>
                    </div>
                  </motion.button>

                  {/* Content Policy */}
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => updateForm('contentPolicyAccepted', !formData.contentPolicyAccepted)}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      formData.contentPolicyAccepted ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      formData.contentPolicyAccepted ? 'border-green-500 bg-green-500' : 'border-white/30'
                    }`}>
                      {formData.contentPolicyAccepted && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Content Policy *</div>
                      <div className="text-sm text-white/50">
                        No minors, illegal content, or violence
                      </div>
                    </div>
                  </motion.button>

                  {/* Payout Terms */}
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    onClick={() => updateForm('payoutTermsAccepted', !formData.payoutTermsAccepted)}
                    className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all ${
                      formData.payoutTermsAccepted ? 'border-green-500 bg-green-500/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                      formData.payoutTermsAccepted ? 'border-green-500 bg-green-500' : 'border-white/30'
                    }`}>
                      {formData.payoutTermsAccepted && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <div>
                      <div className="font-semibold mb-1">Payout Terms *</div>
                      <div className="text-sm text-white/50">
                        85% first 30 days, then 80%
                      </div>
                    </div>
                  </motion.button>
                </div>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-200/90">
                      <p className="font-medium">Important</p>
                      <p className="mt-1 text-yellow-200/70">
                        False information may result in account termination.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error Message */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4 p-4 bg-red-500/20 border border-red-500/30 text-red-200 rounded-2xl text-sm flex items-center gap-3"
            >
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-black/90 backdrop-blur-xl border-t border-white/10">
        <div className="flex gap-3">
          {step > 1 && (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={prevStep}
              className="flex-1 py-4 px-4 rounded-2xl bg-white/10 font-semibold flex items-center justify-center gap-2 border border-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </motion.button>
          )}
          {step < 4 ? (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={nextStep}
              className="flex-1 py-4 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-500/30"
            >
              Continue
              <ArrowRight className="w-5 h-5" />
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={submitApplication}
              disabled={submitting}
              className="flex-1 py-4 px-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-500 font-semibold flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg shadow-green-500/30"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Submit Application
                </>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  )
}
