import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  X, ChevronRight, User, Bell, Shield, Eye, Palette, Globe,
  Moon, Sun, Monitor, Check, Lock, MessageCircle, Heart, UserPlus,
  DollarSign, Gift, Mail, Smartphone, Trash2, Download,
  HelpCircle, FileText, ExternalLink, Wifi, WifiOff,
  ImageOff, Play, Pause, Crown, Loader2, AlertTriangle
} from 'lucide-react'
import { type User as UserType } from '../lib/api'
import {
  getUserSettings, updateUserSettings, type UserSettings, defaultSettings,
  languages, accentColors, getBlockedUsers, unblockUser, requestDataExport,
  requestAccountDeletion, updateProfile, getActiveSessions, terminateSession
} from '../lib/settingsApi'

interface SettingsPageProps {
  user: UserType
  setUser: (user: UserType) => void
  onClose: () => void
}

type SettingsSection = 'main' | 'account' | 'notifications' | 'privacy' | 'content' | 'appearance' | 'language' | 'creator' | 'about' | 'blocked'
  | 'sessions'

export default function SettingsPage({ user, setUser, onClose }: SettingsPageProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>('main')
  const [settings, setSettings] = useState<UserSettings>({ user_id: user.telegram_id, ...defaultSettings })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<{ user_id: number; username: string; avatar_url: string }[]>([])
  const [blockedLoaded, setBlockedLoaded] = useState(false)
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [terminatingSessionId, setTerminatingSessionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({
    first_name: user.first_name || '',
    username: user.username || '',
    bio: user.bio || '',
    subscription_price: user.subscription_price || 0
  })

  useEffect(() => {
    void loadSettings()
  }, [user.telegram_id])

  useEffect(() => {
    if (activeSection === 'blocked' && !blockedLoaded) {
      void loadBlockedUsers()
    }
    if (activeSection === 'sessions' && !sessionsLoaded) {
      void loadSessions()
    }
  }, [activeSection, blockedLoaded, sessionsLoaded])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const userSettings = await getUserSettings(user.telegram_id)
      setSettings(userSettings)
    } catch (err) {
      console.error('[Settings] Failed to load settings', err)
      setErrorMessage('Failed to load settings. Showing defaults until connection is restored.')
      setSettings({ user_id: user.telegram_id, ...defaultSettings })
    } finally {
      setLoading(false)
    }
  }

  const updateSetting = async <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    const previousValue = settings[key]
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)
    setSaving(true)
    const success = await updateUserSettings(user.telegram_id, { [key]: value })
    setSaving(false)
    if (!success) {
      setSettings(prev => ({ ...prev, [key]: previousValue }))
      setErrorMessage('Could not save your changes. Please try again.')
    } else {
      setErrorMessage(null)
    }
  }

  const loadBlockedUsers = async () => {
    const blocked = await getBlockedUsers(user.telegram_id)
    setBlockedUsers(blocked)
    setBlockedLoaded(true)
  }

  const loadSessions = async () => {
    setSessionsLoading(true)
    try {
      const data = await getActiveSessions(user.telegram_id)
      setSessions(data)
      setSessionsLoaded(true)
      setErrorMessage(null)
    } catch (err) {
      console.error('[Settings] Failed to load sessions', err)
      setErrorMessage('Unable to load active sessions right now.')
    } finally {
      setSessionsLoading(false)
    }
  }

  const handleUnblock = async (blockedUserId: number) => {
    const success = await unblockUser(user.telegram_id, blockedUserId)
    if (success) {
      setBlockedUsers(prev => prev.filter(u => u.user_id !== blockedUserId))
    } else {
      setErrorMessage('Failed to unblock this user. Please try again.')
    }
  }

  const handleTerminateSession = async (sessionId: string) => {
    setTerminatingSessionId(sessionId)
    const success = await terminateSession(sessionId)
    setTerminatingSessionId(null)
    if (success) {
      setSessions(prev => prev.filter(session => session.id !== sessionId))
    } else {
      setErrorMessage('Unable to terminate the selected session.')
    }
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    const success = await updateProfile(user.telegram_id, profileForm)
    setSaving(false)
    if (success) {
      setUser({ ...user, ...profileForm })
      setEditingProfile(false)
      setErrorMessage(null)
    } else {
      setErrorMessage('Unable to update your profile right now. Please try again later.')
    }
  }

  const handleExportData = async () => {
    if (window.confirm('We will prepare your data export and notify you when it\'s ready. Continue?')) {
      await requestDataExport(user.telegram_id)
      alert('Data export requested! You will be notified when ready.')
    }
  }

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      'Are you absolutely sure you want to delete your account? This action cannot be undone and all your data will be permanently deleted.'
    )
    if (confirmed) {
      const doubleConfirm = window.confirm(
        'Final confirmation: Type DELETE to confirm account deletion.\n\nThis will delete:\n- All your posts\n- All your messages\n- All your subscriptions\n- Your entire account'
      )
      if (doubleConfirm) {
        await requestAccountDeletion(user.telegram_id)
        alert('Account deletion requested. Your account will be deleted within 30 days.')
      }
    }
  }

  const ToggleSwitch = ({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) => (
    <motion.button
      onClick={() => !disabled && onChange(!value)}
      className={`w-12 h-7 rounded-full p-0.5 transition-colors ${value ? 'bg-of-blue' : 'bg-gray-200'} ${disabled ? 'opacity-50' : ''}`}
      whileTap={disabled ? {} : { scale: 0.95 }}
    >
      <motion.div
        className="w-6 h-6 bg-white rounded-full shadow-sm"
        animate={{ x: value ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  )

  const SettingItem = ({
    icon: Icon,
    label,
    description,
    onClick,
    rightContent,
    danger
  }: {
    icon: any;
    label: string;
    description?: string;
    onClick?: () => void;
    rightContent?: React.ReactNode;
    danger?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 py-3 px-4 text-left active:bg-gray-50 transition-colors ${danger ? 'text-red-600' : 'text-gray-900'}`}
    >
      <Icon className={`w-5 h-5 ${danger ? 'text-red-500' : 'text-gray-600'}`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-normal leading-tight">{label}</div>
        {description && <div className="text-[13px] text-gray-500 mt-0.5 truncate">{description}</div>}
      </div>
      {rightContent || <ChevronRight className="w-5 h-5 text-gray-300" strokeWidth={1.5} />}
    </button>
  )

  const SectionHeader = ({ title, onBack }: { title: string; onBack: () => void }) => (
    <div className="flex items-center gap-3 p-2 border-b border-gray-200 sticky top-0 z-10 safe-area-top" style={{ backgroundColor: '#FFFFFF' }}>
      <button
        onClick={onBack}
        className="w-10 h-10 flex items-center justify-center -ml-1 active:opacity-60"
      >
        <ChevronRight className="w-7 h-7 text-of-blue rotate-180" strokeWidth={2} />
      </button>
      <h2 className="text-[17px] font-semibold text-gray-900">{title}</h2>
      {saving && <Loader2 className="w-4 h-4 animate-spin text-gray-500 ml-auto mr-2" />}
    </div>
  )

  // Main Menu
  const renderMainMenu = () => (
    <div className="space-y-1 pb-8" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="px-4 pt-4 pb-6 text-center border-b border-gray-200 mb-2 bg-white">
        <div className="w-20 h-20 mx-auto rounded-full p-1 border border-gray-200 mb-3">
          <img
            src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
            alt=""
            className="w-full h-full rounded-full object-cover"
          />
        </div>
        <div className="font-bold text-lg text-gray-900">{user.first_name}</div>
        <div className="text-sm text-gray-500 mb-4">@{user.username || 'user'}</div>
        
        <button
          onClick={() => { setEditingProfile(true); setActiveSection('account') }}
          className="px-6 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg active:scale-95 transition-transform"
        >
          Edit Profile
        </button>
      </div>

      <div className="px-4">
        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-4 pl-1">Settings</div>
        <div className="bg-white rounded-xl overflow-hidden divide-y divide-gray-100">
          <SettingItem icon={User} label="Account" onClick={() => setActiveSection('account')} />
          <SettingItem icon={Bell} label="Notifications" onClick={() => setActiveSection('notifications')} />
          <SettingItem icon={Shield} label="Privacy & Security" onClick={() => setActiveSection('privacy')} />
          <SettingItem icon={Smartphone} label="Devices & Sessions" description="Manage logged-in devices" onClick={() => setActiveSection('sessions')} />
          <SettingItem icon={Eye} label="Content Preferences" onClick={() => setActiveSection('content')} />
          <SettingItem icon={Palette} label="Appearance" onClick={() => setActiveSection('appearance')} />
          <SettingItem icon={Globe} label="Language" description={languages.find(l => l.code === settings.language)?.name} onClick={() => setActiveSection('language')} />
        </div>

        {user.is_creator && (
          <>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6 pl-1">Creator</div>
            <div className="bg-white rounded-xl overflow-hidden">
              <SettingItem icon={Crown} label="Creator Tools" onClick={() => setActiveSection('creator')} />
            </div>
          </>
        )}

        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 mt-6 pl-1">Support</div>
        <div className="bg-white rounded-xl overflow-hidden">
          <SettingItem icon={HelpCircle} label="Help & Support" onClick={() => setActiveSection('about')} />
        </div>

        <div className="mt-6">
          <div className="bg-white rounded-xl overflow-hidden">
            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to log out?')) {
                  window.location.reload()
                }
              }}
              className="w-full py-3.5 text-center text-[15px] font-medium text-red-600 active:bg-gray-50"
            >
              Log Out
            </button>
          </div>
          <div className="text-center mt-8 pb-8">
            <div className="text-xs text-gray-400">Veronica v1.0.0</div>
          </div>
        </div>
      </div>
    </div>
  )

  // Account Section
  const renderAccountSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Account" onBack={() => { setActiveSection('main'); setEditingProfile(false) }} />

      <div className="p-4 space-y-4">
        {editingProfile ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
              <input
                type="text"
                value={profileForm.first_name}
                onChange={(e) => setProfileForm({ ...profileForm, first_name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-of-blue focus:ring-1 focus:ring-of-blue outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <div className="flex">
                <span className="px-4 py-3 bg-gray-100 rounded-l-xl border border-r-0 border-gray-200 text-gray-500">@</span>
                <input
                  type="text"
                  value={profileForm.username}
                  onChange={(e) => setProfileForm({ ...profileForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })}
                  className="flex-1 px-4 py-3 rounded-r-xl border border-gray-200 focus:border-of-blue focus:ring-1 focus:ring-of-blue outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bio</label>
              <textarea
                value={profileForm.bio}
                onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-of-blue focus:ring-1 focus:ring-of-blue outline-none resize-none"
                placeholder="Tell people about yourself..."
              />
            </div>
            {user.is_creator && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Subscription Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={profileForm.subscription_price}
                  onChange={(e) => setProfileForm({ ...profileForm, subscription_price: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-of-blue focus:ring-1 focus:ring-of-blue outline-none"
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setEditingProfile(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl"
              >
                Cancel
              </button>
              <motion.button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex-1 py-3 bg-of-blue text-white font-semibold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                whileTap={{ scale: 0.98 }}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save'}
              </motion.button>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <SettingItem
              icon={User}
              label="Edit Profile"
              description="Name, username, bio"
              onClick={() => setEditingProfile(true)}
            />
            <SettingItem
              icon={Download}
              label="Download Your Data"
              description="Get a copy of your data"
              onClick={handleExportData}
            />
            <div className="pt-4">
              <SettingItem
                icon={Trash2}
                label="Delete Account"
                description="Permanently delete your account"
                danger
                onClick={handleDeleteAccount}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Notifications Section
  const renderNotificationsSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Notifications" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-6">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Smartphone className="w-4 h-4" /> Push Notifications
          </h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <Heart className="w-5 h-5 text-red-500" />
                <span className="text-gray-700">Likes</span>
              </div>
              <ToggleSwitch value={settings.notifications_likes} onChange={(v) => updateSetting('notifications_likes', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-blue-500" />
                <span className="text-gray-700">Comments</span>
              </div>
              <ToggleSwitch value={settings.notifications_comments} onChange={(v) => updateSetting('notifications_comments', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <UserPlus className="w-5 h-5 text-green-500" />
                <span className="text-gray-700">New Followers</span>
              </div>
              <ToggleSwitch value={settings.notifications_follows} onChange={(v) => updateSetting('notifications_follows', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <MessageCircle className="w-5 h-5 text-purple-500" />
                <span className="text-gray-700">Messages</span>
              </div>
              <ToggleSwitch value={settings.notifications_messages} onChange={(v) => updateSetting('notifications_messages', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                <span className="text-gray-700">Subscriptions</span>
              </div>
              <ToggleSwitch value={settings.notifications_subscriptions} onChange={(v) => updateSetting('notifications_subscriptions', v)} />
            </div>
            <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <Gift className="w-5 h-5 text-pink-500" />
                <span className="text-gray-700">Tips</span>
              </div>
              <ToggleSwitch value={settings.notifications_tips} onChange={(v) => updateSetting('notifications_tips', v)} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" /> Email Notifications
          </h3>
          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
            <div>
              <div className="text-gray-700">Email Notifications</div>
              <div className="text-sm text-gray-500">Get important updates via email</div>
            </div>
            <ToggleSwitch value={settings.email_notifications} onChange={(v) => updateSetting('email_notifications', v)} />
          </div>
        </div>
      </div>
    </div>
  )

  // Privacy Section
  const renderPrivacySection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Privacy & Security" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-6">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Profile Visibility</h3>
          <div className="space-y-2">
            {(['public', 'followers_only', 'private'] as const).map((option) => (
              <motion.button
                key={option}
                onClick={() => updateSetting('profile_visibility', option)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  settings.profile_visibility === option
                    ? 'border-of-blue bg-blue-50'
                    : 'border-gray-100 bg-white'
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900 capitalize">{option.replace('_', ' ')}</div>
                    <div className="text-sm text-gray-500">
                      {option === 'public' && 'Anyone can see your profile'}
                      {option === 'followers_only' && 'Only followers can see your content'}
                      {option === 'private' && 'Only you can see your profile'}
                    </div>
                  </div>
                  {settings.profile_visibility === option && (
                    <Check className="w-5 h-5 text-of-blue" />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Who Can Message You</h3>
          <div className="space-y-2">
            {(['everyone', 'followers', 'subscribers', 'nobody'] as const).map((option) => (
              <motion.button
                key={option}
                onClick={() => updateSetting('allow_messages_from', option)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  settings.allow_messages_from === option
                    ? 'border-of-blue bg-blue-50'
                    : 'border-gray-100 bg-white'
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900 capitalize">{option}</div>
                  {settings.allow_messages_from === option && (
                    <Check className="w-5 h-5 text-of-blue" />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
            <div>
              <div className="text-gray-700">Show Online Status</div>
              <div className="text-sm text-gray-500">Let others see when you're active</div>
            </div>
            <ToggleSwitch value={settings.show_online_status} onChange={(v) => updateSetting('show_online_status', v)} />
          </div>
          <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
            <div>
              <div className="text-gray-700">Show Activity Status</div>
              <div className="text-sm text-gray-500">Show your likes and comments</div>
            </div>
            <ToggleSwitch value={settings.show_activity_status} onChange={(v) => updateSetting('show_activity_status', v)} />
          </div>
        </div>

        <SettingItem
          icon={Lock}
          label="Blocked Users"
          description={`${blockedUsers.length} blocked`}
          onClick={() => { loadBlockedUsers(); setActiveSection('blocked') }}
        />
      </div>
    </div>
  )

  // Content Section
  const renderContentSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Content Preferences" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Show NSFW Content</div>
              <div className="text-sm text-gray-500">Display adult content in feeds</div>
            </div>
          </div>
          <ToggleSwitch value={settings.show_nsfw_content} onChange={(v) => updateSetting('show_nsfw_content', v)} />
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center">
              <ImageOff className="w-5 h-5 text-gray-500" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Blur Sensitive Content</div>
              <div className="text-sm text-gray-500">Blur until you tap to reveal</div>
            </div>
          </div>
          <ToggleSwitch value={settings.blur_sensitive_content} onChange={(v) => updateSetting('blur_sensitive_content', v)} />
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
              {settings.autoplay_videos ? <Play className="w-5 h-5 text-blue-500" /> : <Pause className="w-5 h-5 text-blue-500" />}
            </div>
            <div>
              <div className="font-medium text-gray-900">Autoplay Videos</div>
              <div className="text-sm text-gray-500">Videos play automatically</div>
            </div>
          </div>
          <ToggleSwitch value={settings.autoplay_videos} onChange={(v) => updateSetting('autoplay_videos', v)} />
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
              {settings.data_saver_mode ? <WifiOff className="w-5 h-5 text-green-500" /> : <Wifi className="w-5 h-5 text-green-500" />}
            </div>
            <div>
              <div className="font-medium text-gray-900">Data Saver Mode</div>
              <div className="text-sm text-gray-500">Reduce data usage</div>
            </div>
          </div>
          <ToggleSwitch value={settings.data_saver_mode} onChange={(v) => updateSetting('data_saver_mode', v)} />
        </div>
      </div>
    </div>
  )

  // Appearance Section
  const renderAppearanceSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Appearance" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-6">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Theme</h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'light', icon: Sun, label: 'Light' },
              { value: 'dark', icon: Moon, label: 'Dark' },
              { value: 'system', icon: Monitor, label: 'System' }
            ].map(({ value, icon: Icon, label }) => (
              <motion.button
                key={value}
                onClick={() => updateSetting('theme', value as any)}
                className={`p-4 rounded-xl border-2 text-center transition-colors ${
                  settings.theme === value
                    ? 'border-of-blue bg-blue-50'
                    : 'border-gray-100 bg-white'
                }`}
                whileTap={{ scale: 0.95 }}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${settings.theme === value ? 'text-of-blue' : 'text-gray-500'}`} />
                <div className={`text-sm font-medium ${settings.theme === value ? 'text-of-blue' : 'text-gray-700'}`}>{label}</div>
              </motion.button>
            ))}
          </div>
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Accent Color</h3>
          <div className="flex flex-wrap gap-3">
            {accentColors.map(({ name, value }) => (
              <motion.button
                key={value}
                onClick={() => updateSetting('accent_color', value)}
                className={`w-12 h-12 rounded-full border-4 transition-all ${
                  settings.accent_color === value
                    ? 'border-gray-900 scale-110'
                    : 'border-transparent'
                }`}
                style={{ backgroundColor: value }}
                whileTap={{ scale: 0.9 }}
                title={name}
              >
                {settings.accent_color === value && (
                  <Check className="w-5 h-5 text-white mx-auto" />
                )}
              </motion.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )

  // Language Section
  const renderLanguageSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Language" onBack={() => setActiveSection('main')} />

      <div className="p-4">
        <div className="space-y-2">
          {languages.map((lang) => (
            <motion.button
              key={lang.code}
              onClick={() => updateSetting('language', lang.code)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                settings.language === lang.code
                  ? 'border-of-blue bg-blue-50'
                  : 'border-gray-100 bg-white'
              }`}
              whileTap={{ scale: 0.98 }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-gray-900">{lang.name}</div>
                  <div className="text-sm text-gray-500">{lang.native}</div>
                </div>
                {settings.language === lang.code && (
                  <Check className="w-5 h-5 text-of-blue" />
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )

  // Creator Section
  const renderCreatorSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Creator Settings" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-6">
        <div>
          <h3 className="font-semibold text-gray-900 mb-3">Default Post Visibility</h3>
          <div className="space-y-2">
            {(['public', 'followers', 'subscribers'] as const).map((option) => (
              <motion.button
                key={option}
                onClick={() => updateSetting('default_post_visibility', option)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                  settings.default_post_visibility === option
                    ? 'border-of-blue bg-blue-50'
                    : 'border-gray-100 bg-white'
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium text-gray-900 capitalize">{option}</div>
                  {settings.default_post_visibility === option && (
                    <Check className="w-5 h-5 text-of-blue" />
                  )}
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div>
            <div className="font-medium text-gray-900">Watermark on Media</div>
            <div className="text-sm text-gray-500">Add username watermark</div>
          </div>
          <ToggleSwitch value={settings.watermark_enabled} onChange={(v) => updateSetting('watermark_enabled', v)} />
        </div>

        <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100">
          <div>
            <div className="font-medium text-gray-900">Auto-Welcome New Subscribers</div>
            <div className="text-sm text-gray-500">Send automatic message</div>
          </div>
          <ToggleSwitch value={settings.auto_message_new_subscribers} onChange={(v) => updateSetting('auto_message_new_subscribers', v)} />
        </div>

        {settings.auto_message_new_subscribers && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
          >
            <label className="block text-sm font-medium text-gray-700 mb-2">Welcome Message</label>
            <textarea
              value={settings.welcome_message}
              onChange={(e) => updateSetting('welcome_message', e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-of-blue focus:ring-1 focus:ring-of-blue outline-none resize-none"
              placeholder="Thanks for subscribing!"
            />
          </motion.div>
        )}
      </div>
    </div>
  )

  // Blocked Users Section
  const renderBlockedSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Blocked Users" onBack={() => setActiveSection('privacy')} />

      <div className="p-4">
        {blockedUsers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-gray-500">No blocked users</div>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedUsers.map((blocked) => (
              <div key={blocked.user_id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <img
                    src={blocked.avatar_url || `https://i.pravatar.cc/150?u=${blocked.user_id}`}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <span className="font-medium text-gray-900">@{blocked.username}</span>
                </div>
                <motion.button
                  onClick={() => handleUnblock(blocked.user_id)}
                  className="px-4 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-xl"
                  whileTap={{ scale: 0.95 }}
                >
                  Unblock
                </motion.button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const renderSessionsSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Devices & Sessions" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-4">
        {sessionsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-of-blue" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-8 h-8 text-gray-400" />
            </div>
            <div className="text-gray-500 text-sm">No active sessions</div>
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="p-4 bg-white rounded-2xl border border-gray-100 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="font-semibold text-gray-900">{session.device_name || 'Unknown device'}</div>
                  <div className="text-sm text-gray-500">
                    {session.location || 'Location unavailable'} · Last active{' '}
                    {session.last_active ? new Date(session.last_active).toLocaleString() : 'unknown'}
                  </div>
                  {session.ip_address && (
                    <div className="text-xs text-gray-400 mt-1">IP {session.ip_address}</div>
                  )}
                </div>
                <motion.button
                  onClick={() => handleTerminateSession(session.id)}
                  whileTap={{ scale: 0.95 }}
                  className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700"
                  disabled={terminatingSessionId === session.id}
                >
                  {terminatingSessionId === session.id ? 'Ending...' : 'Log out'}
                </motion.button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // About Section
  const renderAboutSection = () => (
    <div style={{ backgroundColor: '#FFFFFF', minHeight: '100%' }}>
      <SectionHeader title="Help & About" onBack={() => setActiveSection('main')} />

      <div className="p-4 space-y-3">
        <SettingItem
          icon={HelpCircle}
          label="Help Center"
          description="FAQs and support"
          rightContent={<ExternalLink className="w-5 h-5 text-gray-400" />}
        />
        <SettingItem
          icon={FileText}
          label="Terms of Service"
          rightContent={<ExternalLink className="w-5 h-5 text-gray-400" />}
        />
        <SettingItem
          icon={Shield}
          label="Privacy Policy"
          rightContent={<ExternalLink className="w-5 h-5 text-gray-400" />}
        />
        <SettingItem
          icon={FileText}
          label="Community Guidelines"
          rightContent={<ExternalLink className="w-5 h-5 text-gray-400" />}
        />

        <div className="pt-6 text-center">
          <div className="text-2xl font-bold bg-gradient-to-r from-of-blue to-purple-500 bg-clip-text text-transparent mb-1">
            Veronica
          </div>
          <div className="text-sm text-gray-500">Version 1.0.0</div>
          <div className="text-xs text-gray-400 mt-2">Made with love for creators</div>
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case 'account': return renderAccountSection()
      case 'notifications': return renderNotificationsSection()
      case 'privacy': return renderPrivacySection()
      case 'content': return renderContentSection()
      case 'appearance': return renderAppearanceSection()
      case 'language': return renderLanguageSection()
      case 'creator': return renderCreatorSection()
      case 'blocked': return renderBlockedSection()
      case 'about': return renderAboutSection()
      case 'sessions': return renderSessionsSection()
      default: return (
        <>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 sticky top-0 z-10 safe-area-top" style={{ backgroundColor: '#FFFFFF' }}>
            <h2 className="text-[17px] font-semibold text-gray-900">Settings</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center bg-gray-100 rounded-full"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          {renderMainMenu()}
        </>
      )
    }
  }

  if (loading) {
    return (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        <Loader2 className="w-8 h-8 animate-spin text-of-blue" />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{ backgroundColor: '#FFFFFF', height: '100vh', width: '100vw' }}
    >
      {errorMessage && (
        <div className="bg-red-50 text-red-700 text-sm px-4 py-2 text-center border-b border-red-100">
          {errorMessage}
        </div>
      )}
      <div
        className="flex-1 overflow-y-auto"
        style={{ backgroundColor: '#FFFFFF' }}
      >
        {renderContent()}
      </div>
    </div>
  )
}
