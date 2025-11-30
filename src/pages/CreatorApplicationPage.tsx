import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, ArrowRight, Check, AlertCircle, Calendar, Mail, Phone, Globe, Instagram, Twitter, Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { type User } from '../lib/api'

interface CreatorApplicationPageProps {
  user: User
  onBack: () => void
  onSuccess: () => void
}

const CONTENT_CATEGORIES = [
  { id: 'lifestyle', name: 'Lifestyle', nsfw: false },
  { id: 'fitness', name: 'Fitness', nsfw: false },
  { id: 'fashion', name: 'Fashion', nsfw: false },
  { id: 'art', name: 'Art', nsfw: false },
  { id: 'music', name: 'Music', nsfw: false },
  { id: 'gaming', name: 'Gaming', nsfw: false },
  { id: 'education', name: 'Education', nsfw: false },
  { id: 'cooking', name: 'Cooking', nsfw: false },
  { id: 'photography', name: 'Photography', nsfw: false },
  { id: 'cosplay', name: 'Cosplay', nsfw: false },
  { id: 'asmr', name: 'ASMR', nsfw: false },
  { id: 'adult', name: 'Adult/Explicit (18+)', nsfw: true },
]

const STEPS = [
  { id: 1, title: 'Personal Info', desc: 'Basic information' },
  { id: 2, title: 'Content Type', desc: 'What you\'ll create' },
  { id: 3, title: 'Social Links', desc: 'Optional verification' },
  { id: 4, title: 'Terms & Agreements', desc: 'Legal requirements' },
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-of-blue text-white">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={onBack} className="p-1">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="font-bold">Become a Creator</h1>
          <div className="w-6" />
        </div>
      </div>

      {/* Progress */}
      <div className="pt-16 px-4 pb-4 bg-white border-b">
        <div className="flex justify-between mb-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex-1 text-center">
              <div className={`w-8 h-8 rounded-full mx-auto flex items-center justify-center text-sm font-bold ${
                step > s.id ? 'bg-green-500 text-white' : step === s.id ? 'bg-of-blue text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > s.id ? <Check className="w-4 h-4" /> : s.id}
              </div>
              <div className="text-xs mt-1 text-gray-500">{s.title}</div>
            </div>
          ))}
        </div>
        <div className="h-1 bg-gray-200 rounded-full">
          <div
            className="h-full bg-of-blue rounded-full transition-all"
            style={{ width: `${((step - 1) / 3) * 100}%` }}
          />
        </div>
      </div>

      {/* Form Content */}
      <div className="p-4 pb-32">
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
                <h2 className="text-lg font-bold">Personal Information</h2>
                <p className="text-sm text-gray-500">This information is required for verification and will be kept private.</p>

                <div>
                  <label className="block text-sm font-medium mb-1">Legal Full Name *</label>
                  <input
                    type="text"
                    value={formData.legalName}
                    onChange={(e) => updateForm('legalName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                    placeholder="As it appears on your ID"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Date of Birth *</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => updateForm('dateOfBirth', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      max={new Date(Date.now() - 18 * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">You must be 18 or older</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Country *</label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) => updateForm('country', e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                        placeholder="Country"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">City</label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateForm('city', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      placeholder="City"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateForm('email', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      placeholder="your@email.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => updateForm('phone', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      placeholder="+1 234 567 8900"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Content Type</h2>
                <p className="text-sm text-gray-500">Tell us what kind of content you plan to create.</p>

                {/* Privacy Notice */}
                <div className="p-3 bg-gray-100 rounded-xl">
                  <p className="text-xs text-gray-500 text-center">
                    These selections are for internal review only and will not be displayed on your public profile.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Content Rating *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => updateForm('contentType', 'sfw')}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        formData.contentType === 'sfw'
                          ? 'border-of-blue bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="text-2xl mb-1">🌟</div>
                      <div className="font-semibold">SFW</div>
                      <div className="text-xs text-gray-500">Safe for work</div>
                    </button>
                    <button
                      onClick={() => updateForm('contentType', 'nsfw')}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        formData.contentType === 'nsfw'
                          ? 'border-of-blue bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="text-2xl mb-1">🔞</div>
                      <div className="font-semibold">NSFW</div>
                      <div className="text-xs text-gray-500">Adult content (18+)</div>
                    </button>
                  </div>
                  {formData.contentType === 'nsfw' && (
                    <div className="mt-2 p-3 bg-yellow-50 rounded-xl text-sm text-yellow-800">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      Adult content requires strict age verification and compliance with all applicable laws.
                    </div>
                  )}
                </div>

                {/* AI Generated Content */}
                <div>
                  <label className="block text-sm font-medium mb-2">Content Source *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => updateForm('isAiGenerated', false)}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        !formData.isAiGenerated
                          ? 'border-of-blue bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="text-2xl mb-1">📸</div>
                      <div className="font-semibold">Real Content</div>
                      <div className="text-xs text-gray-500">Photos, videos of yourself</div>
                    </button>
                    <button
                      onClick={() => updateForm('isAiGenerated', true)}
                      className={`p-4 rounded-xl border-2 text-center transition-all ${
                        formData.isAiGenerated
                          ? 'border-of-blue bg-blue-50'
                          : 'border-gray-200'
                      }`}
                    >
                      <div className="text-2xl mb-1">🤖</div>
                      <div className="font-semibold">AI Generated</div>
                      <div className="text-xs text-gray-500">AI-created images/content</div>
                    </button>
                  </div>
                  {formData.isAiGenerated && (
                    <div className="mt-2 p-3 bg-purple-50 rounded-xl text-sm text-purple-800">
                      <AlertCircle className="w-4 h-4 inline mr-1" />
                      AI-generated content must be clearly labeled. You must own or have rights to the AI models/tools used.
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-2 text-center">
                    This information is private and helps us categorize content appropriately.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Content Categories * (select all that apply)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {CONTENT_CATEGORIES.filter(c => formData.contentType === 'nsfw' || !c.nsfw).map((cat) => (
                      <button
                        key={cat.id}
                        onClick={() => toggleCategory(cat.id)}
                        className={`p-3 rounded-xl border text-left text-sm transition-all ${
                          formData.categories.includes(cat.id)
                            ? 'border-of-blue bg-blue-50 text-of-blue'
                            : 'border-gray-200'
                        }`}
                      >
                        {formData.categories.includes(cat.id) && <Check className="w-4 h-4 inline mr-1" />}
                        {cat.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Describe Your Content</label>
                  <textarea
                    value={formData.contentDescription}
                    onChange={(e) => updateForm('contentDescription', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none resize-none"
                    rows={3}
                    placeholder="Tell us more about the content you plan to create..."
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Social Media Links</h2>
                <p className="text-sm text-gray-500">Optional but helps us verify your identity and may speed up approval.</p>

                <div>
                  <label className="block text-sm font-medium mb-1">Instagram</label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="url"
                      value={formData.instagram}
                      onChange={(e) => updateForm('instagram', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      placeholder="https://instagram.com/username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Twitter/X</label>
                  <div className="relative">
                    <Twitter className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="url"
                      value={formData.twitter}
                      onChange={(e) => updateForm('twitter', e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                      placeholder="https://twitter.com/username"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">TikTok</label>
                  <input
                    type="url"
                    value={formData.tiktok}
                    onChange={(e) => updateForm('tiktok', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none"
                    placeholder="https://tiktok.com/@username"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Other Platforms</label>
                  <textarea
                    value={formData.otherPlatforms}
                    onChange={(e) => updateForm('otherPlatforms', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-of-blue focus:outline-none resize-none"
                    rows={2}
                    placeholder="YouTube, OnlyFans, Patreon, etc..."
                  />
                </div>

                <div className="p-3 bg-gray-100 rounded-xl text-sm text-gray-600">
                  <p>💡 Having existing social media presence helps verify your identity and can speed up the approval process.</p>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <h2 className="text-lg font-bold">Terms & Agreements</h2>
                <p className="text-sm text-gray-500">Please read and accept all terms to complete your application.</p>

                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-4 bg-white rounded-xl border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.ageConfirmed}
                      onChange={(e) => updateForm('ageConfirmed', e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-gray-300 text-of-blue focus:ring-of-blue"
                    />
                    <div>
                      <div className="font-medium">Age Confirmation *</div>
                      <div className="text-sm text-gray-500">
                        I confirm that I am at least 18 years of age and legally able to enter into this agreement in my jurisdiction.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white rounded-xl border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.termsAccepted}
                      onChange={(e) => updateForm('termsAccepted', e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-gray-300 text-of-blue focus:ring-of-blue"
                    />
                    <div>
                      <div className="font-medium">Terms of Service *</div>
                      <div className="text-sm text-gray-500">
                        I have read and agree to the <span className="text-of-blue">Creator Terms of Service</span>, including all rules regarding content ownership, account conduct, and platform usage.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white rounded-xl border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.contentPolicyAccepted}
                      onChange={(e) => updateForm('contentPolicyAccepted', e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-gray-300 text-of-blue focus:ring-of-blue"
                    />
                    <div>
                      <div className="font-medium">Content Policy *</div>
                      <div className="text-sm text-gray-500">
                        I agree to the <span className="text-of-blue">Content Policy</span> and understand that:
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>I will not upload content involving minors</li>
                          <li>I will verify age of anyone featured in my content</li>
                          <li>I will not upload illegal, violent, or prohibited content</li>
                          <li>I own or have rights to all content I upload</li>
                        </ul>
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-4 bg-white rounded-xl border cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.payoutTermsAccepted}
                      onChange={(e) => updateForm('payoutTermsAccepted', e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded border-gray-300 text-of-blue focus:ring-of-blue"
                    />
                    <div>
                      <div className="font-medium">Payout Terms *</div>
                      <div className="text-sm text-gray-500">
                        I understand and agree to the payout structure:
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          <li>First 30 days: 85% of gross revenue</li>
                          <li>After 30 days: 80% of gross revenue</li>
                          <li>7-day settlement period before withdrawal</li>
                          <li>I am responsible for my own tax obligations</li>
                        </ul>
                      </div>
                    </div>
                  </label>
                </div>

                <div className="p-4 bg-yellow-50 rounded-xl">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium">Important Notice</p>
                      <p className="mt-1">
                        By submitting this application, you declare that all information provided is accurate and truthful.
                        Providing false information may result in permanent account termination and potential legal action.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Error Message */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-3 bg-red-100 text-red-700 rounded-xl text-sm flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
        <div className="flex gap-3">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="flex-1 py-3 px-4 rounded-xl border border-gray-300 font-semibold flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              onClick={nextStep}
              className="flex-1 py-3 px-4 rounded-xl bg-of-blue text-white font-semibold flex items-center justify-center gap-2"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={submitApplication}
              disabled={submitting}
              className="flex-1 py-3 px-4 rounded-xl bg-of-blue text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Submit Application
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
