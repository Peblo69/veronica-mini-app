import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, FileText, Shield, BarChart3, Search, ChevronRight,
  Check, X, Eye, Trash2, Ban, UserCheck, MessageCircle,
  Lock, Settings, RefreshCw, ArrowLeft, Flag,
  TrendingUp, Activity, Megaphone, Plus, UserX, Unlock
} from 'lucide-react'
import {
  checkIsAdmin, getAllUsers, getUserDetails, adminUpdateUser,
  banUser, unbanUser, getAllPosts, hidePost, unhidePost, deletePost,
  getApplications, approveApplication, rejectApplication,
  getPlatformStats, getReports, updateReport, getReportedContent,
  getFlaggedContent, reviewFlaggedContent,
  getAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  listConversations, getConversationMessages, deleteMessage,
  getActivityLog, getRecentActivity, listAdmins, createAdmin, deleteAdmin,
  subscribeToAllActivity,
  type AdminUser, type CreatorApplication, type PlatformStats,
  type Report, type FlaggedContent, type Announcement, type Conversation,
  type Message, type AdminActivityLog, type UserBan
} from '../lib/adminApi'
import { type User, type Post } from '../lib/api'

interface AdminPageProps {
  telegramId: number
  onExit: () => void
}

type Tab = 'dashboard' | 'users' | 'messages' | 'posts' | 'applications' | 'reports' | 'moderation' | 'announcements' | 'settings'

export default function AdminPage({ telegramId, onExit }: AdminPageProps) {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  // Dashboard
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [recentActivity, setRecentActivity] = useState<{ recentUsers: any[]; recentPosts: any[]; recentMessages: any[] } | null>(null)
  const [activityFeed, setActivityFeed] = useState<any[]>([])

  // Users
  const [users, setUsers] = useState<User[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1)
  const [usersSearch, setUsersSearch] = useState('')
  const [usersFilter, setUsersFilter] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  // Messages
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [, setConversationsTotal] = useState(0)
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [conversationMessages, setConversationMessages] = useState<Message[]>([])

  // Posts
  const [posts, setPosts] = useState<Post[]>([])
  const [postsTotal, setPostsTotal] = useState(0)
  const [postsPage, setPostsPage] = useState(1)
  const [postsFilter, setPostsFilter] = useState<{ is_nsfw?: boolean; is_hidden?: boolean }>({})

  // Applications
  const [applications, setApplications] = useState<CreatorApplication[]>([])
  const [, setApplicationsTotal] = useState(0)
  const [appFilter, setAppFilter] = useState<string>('pending')

  // Reports
  const [reports, setReports] = useState<Report[]>([])
  const [, setReportsTotal] = useState(0)
  const [reportFilter, setReportFilter] = useState<string>('pending')
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)
  const [reportedContent, setReportedContent] = useState<any>(null)

  // Moderation Queue
  const [flaggedContent, setFlaggedContent] = useState<FlaggedContent[]>([])
  const [, setFlaggedTotal] = useState(0)
  const [flaggedFilter, setFlaggedFilter] = useState<string>('pending')

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    content: '',
    type: 'info',
    targetAudience: 'all',
    isDismissible: true
  })

  // Settings
  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([])
  const [showAddAdmin, setShowAddAdmin] = useState(false)
  const [newAdminForm, setNewAdminForm] = useState({ telegramId: '', username: '', role: 'moderator' })

  useEffect(() => {
    checkAdminAccess()
  }, [])

  // Real-time subscriptions
  useEffect(() => {
    if (!admin) return

    const subscription = subscribeToAllActivity({
      onNewUser: (user) => {
        setActivityFeed(prev => [{ type: 'user', data: user, time: new Date() }, ...prev.slice(0, 49)])
        setStats(s => s ? { ...s, total_users: s.total_users + 1, new_users_today: s.new_users_today + 1 } : s)
      },
      onNewPost: (post) => {
        setActivityFeed(prev => [{ type: 'post', data: post, time: new Date() }, ...prev.slice(0, 49)])
        setStats(s => s ? { ...s, total_posts: s.total_posts + 1 } : s)
      },
      onNewMessage: (msg) => {
        setActivityFeed(prev => [{ type: 'message', data: msg, time: new Date() }, ...prev.slice(0, 49)])
      },
      onNewReport: (report) => {
        setActivityFeed(prev => [{ type: 'report', data: report, time: new Date() }, ...prev.slice(0, 49)])
        setStats(s => s ? { ...s, pending_reports: s.pending_reports + 1 } : s)
      },
      onNewFlagged: (flagged) => {
        setActivityFeed(prev => [{ type: 'flagged', data: flagged, time: new Date() }, ...prev.slice(0, 49)])
        setStats(s => s ? { ...s, pending_flagged: s.pending_flagged + 1 } : s)
      },
      onNewApplication: (app) => {
        if (app.status === 'pending') {
          setActivityFeed(prev => [{ type: 'application', data: app, time: new Date() }, ...prev.slice(0, 49)])
          setStats(s => s ? { ...s, pending_applications: s.pending_applications + 1 } : s)
        }
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [admin])

  const checkAdminAccess = async () => {
    const adminUser = await checkIsAdmin(telegramId)
    if (adminUser) {
      setAdmin(adminUser)
      loadDashboard()
    }
    setLoading(false)
  }

  const loadDashboard = async () => {
    const [platformStats, activity] = await Promise.all([
      getPlatformStats(),
      getRecentActivity(10)
    ])
    setStats(platformStats)
    setRecentActivity(activity)
  }

  const loadUsers = useCallback(async (page = 1, search?: string, filter?: string) => {
    const { users: userData, total } = await getAllUsers(page, 20, search, filter)
    setUsers(userData)
    setUsersTotal(total)
    setUsersPage(page)
  }, [])

  const loadConversations = useCallback(async (page = 1) => {
    const { conversations: data, total } = await listConversations(page, 50)
    setConversations(data)
    setConversationsTotal(total)
  }, [])

  const loadConversationMessages = useCallback(async (conversationId: number) => {
    const { messages } = await getConversationMessages(conversationId)
    setConversationMessages(messages)
  }, [])

  const loadPosts = useCallback(async (page = 1, filters?: typeof postsFilter) => {
    const { posts: postsData, total } = await getAllPosts(page, 20, filters)
    setPosts(postsData)
    setPostsTotal(total)
    setPostsPage(page)
  }, [])

  const loadApplications = useCallback(async (status?: string) => {
    const { applications: apps, total } = await getApplications(status)
    setApplications(apps)
    setApplicationsTotal(total)
  }, [])

  const loadReports = useCallback(async (status?: string) => {
    const { reports: data, total } = await getReports(status)
    setReports(data)
    setReportsTotal(total)
  }, [])

  const loadFlaggedContent = useCallback(async (status = 'pending') => {
    const { flagged, total } = await getFlaggedContent(status)
    setFlaggedContent(flagged)
    setFlaggedTotal(total)
  }, [])

  const loadAnnouncements = useCallback(async () => {
    const data = await getAnnouncements(true)
    setAnnouncements(data)
  }, [])

  const loadAdmins = useCallback(async () => {
    const data = await listAdmins()
    setAdmins(data)
  }, [])

  const loadActivityLogs = useCallback(async () => {
    const { logs } = await getActivityLog(1, 100)
    setActivityLogs(logs)
  }, [])

  const handleViewUser = async (user: User) => {
    const details = await getUserDetails(user.telegram_id)
    setSelectedUser(details)
  }

  const handleBanUser = async (userId: number, reason: string, isPermanent: boolean, duration?: number) => {
    if (admin) {
      await banUser(userId, reason, admin.telegram_id, isPermanent, duration)
      loadUsers(usersPage, usersSearch, usersFilter)
      setSelectedUser(null)
    }
  }

  const handleUnbanUser = async (userId: number) => {
    if (admin) {
      await unbanUser(userId, admin.telegram_id)
      loadUsers(usersPage, usersSearch, usersFilter)
      setSelectedUser(null)
    }
  }

  const handleApproveApp = async (app: CreatorApplication) => {
    if (admin) {
      await approveApplication(app.id, app.user_id, admin.telegram_id)
      loadApplications(appFilter)
      setStats(s => s ? { ...s, pending_applications: Math.max(0, s.pending_applications - 1) } : s)
    }
  }

  const handleRejectApp = async (app: CreatorApplication, reason: string) => {
    if (admin) {
      await rejectApplication(app.id, app.user_id, reason, admin.telegram_id)
      loadApplications(appFilter)
      setStats(s => s ? { ...s, pending_applications: Math.max(0, s.pending_applications - 1) } : s)
    }
  }

  const handleHidePost = async (postId: number, reason: string) => {
    if (admin) {
      await hidePost(postId, reason, admin.telegram_id)
      loadPosts(postsPage, postsFilter)
    }
  }

  const handleUnhidePost = async (postId: number) => {
    if (admin) {
      await unhidePost(postId, admin.telegram_id)
      loadPosts(postsPage, postsFilter)
    }
  }

  const handleDeletePost = async (postId: number) => {
    if (admin && confirm('Permanently delete this post? This cannot be undone.')) {
      await deletePost(postId, admin.telegram_id)
      loadPosts(postsPage, postsFilter)
    }
  }

  const handleViewReport = async (report: Report) => {
    setSelectedReport(report)
    const { content } = await getReportedContent(report.reported_type, report.reported_id)
    setReportedContent(content)
  }

  const handleResolveReport = async (reportId: number, status: string, notes?: string) => {
    if (admin) {
      await updateReport(reportId, { status, resolution_notes: notes } as any, admin.telegram_id)
      loadReports(reportFilter)
      setSelectedReport(null)
      setReportedContent(null)
      setStats(s => s ? { ...s, pending_reports: Math.max(0, s.pending_reports - 1) } : s)
    }
  }

  const handleReviewFlagged = async (flaggedId: number, decision: 'approved' | 'rejected', notes?: string) => {
    if (admin) {
      await reviewFlaggedContent(flaggedId, decision, admin.telegram_id, notes)
      loadFlaggedContent(flaggedFilter)
      setStats(s => s ? { ...s, pending_flagged: Math.max(0, s.pending_flagged - 1) } : s)
    }
  }

  const handleCreateAnnouncement = async () => {
    if (admin && announcementForm.title && announcementForm.content) {
      await createAnnouncement(
        announcementForm.title,
        announcementForm.content,
        admin.telegram_id,
        {
          type: announcementForm.type,
          targetAudience: announcementForm.targetAudience,
          isDismissible: announcementForm.isDismissible
        }
      )
      loadAnnouncements()
      setShowAnnouncementForm(false)
      setAnnouncementForm({ title: '', content: '', type: 'info', targetAudience: 'all', isDismissible: true })
    }
  }

  const handleDeleteAnnouncement = async (id: number) => {
    if (admin && confirm('Delete this announcement?')) {
      await deleteAnnouncement(id, admin.telegram_id)
      loadAnnouncements()
    }
  }

  const handleToggleAnnouncement = async (announcement: Announcement) => {
    if (admin) {
      await updateAnnouncement(announcement.id, { is_active: !announcement.is_active }, admin.telegram_id)
      loadAnnouncements()
    }
  }

  const handleAddAdmin = async () => {
    if (admin && newAdminForm.telegramId) {
      const permissions = {
        view_users: true,
        edit_users: newAdminForm.role !== 'moderator',
        ban_users: newAdminForm.role !== 'moderator',
        delete_posts: true,
        manage_applications: newAdminForm.role !== 'moderator',
        view_messages: newAdminForm.role === 'super_admin',
        view_analytics: true,
        manage_reports: true,
        post_announcements: newAdminForm.role !== 'moderator',
        manage_admins: newAdminForm.role === 'super_admin'
      }
      await createAdmin(
        Number(newAdminForm.telegramId),
        newAdminForm.username,
        newAdminForm.role,
        permissions,
        admin.telegram_id
      )
      loadAdmins()
      setShowAddAdmin(false)
      setNewAdminForm({ telegramId: '', username: '', role: 'moderator' })
    }
  }

  const handleDeleteAdmin = async (targetId: number) => {
    if (admin && confirm('Remove this admin?')) {
      await deleteAdmin(targetId, admin.telegram_id)
      loadAdmins()
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    if (admin && confirm('Delete this message?')) {
      await deleteMessage(messageId, admin.telegram_id)
      if (selectedConversation) {
        loadConversationMessages(selectedConversation.id)
      }
    }
  }

  useEffect(() => {
    if (admin) {
      if (activeTab === 'users') loadUsers()
      if (activeTab === 'messages') loadConversations()
      if (activeTab === 'posts') loadPosts()
      if (activeTab === 'applications') loadApplications(appFilter)
      if (activeTab === 'reports') loadReports(reportFilter)
      if (activeTab === 'moderation') loadFlaggedContent(flaggedFilter)
      if (activeTab === 'announcements') loadAnnouncements()
      if (activeTab === 'settings') {
        loadAdmins()
        loadActivityLogs()
      }
    }
  }, [activeTab, admin])

  const formatTime = (date: string | Date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    return d.toLocaleDateString()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p>Verifying admin access...</p>
        </div>
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-6">You don't have admin privileges.</p>
          <button onClick={onExit} className="px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold">
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'messages', label: 'Messages', icon: MessageCircle, permission: 'view_messages' },
    { id: 'posts', label: 'Posts', icon: FileText },
    { id: 'applications', label: 'Applications', icon: UserCheck, badge: stats?.pending_applications },
    { id: 'reports', label: 'Reports', icon: Flag, badge: stats?.pending_reports },
    { id: 'moderation', label: 'Moderation', icon: Shield, badge: stats?.pending_flagged },
    { id: 'announcements', label: 'Announce', icon: Megaphone, permission: 'post_announcements' },
    { id: 'settings', label: 'Settings', icon: Settings },
  ].filter(tab => !tab.permission || admin.permissions[tab.permission as keyof typeof admin.permissions])

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="p-2 hover:bg-gray-700 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-lg flex items-center gap-2">
              Admin Panel
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" title="Real-time connected" />
            </h1>
            <p className="text-xs text-gray-400">{admin.username} ({admin.role})</p>
          </div>
        </div>
        <button onClick={loadDashboard} className="p-2 hover:bg-gray-700 rounded-lg">
          <RefreshCw className="w-5 h-5" />
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-800 px-2 py-2 flex gap-1 overflow-x-auto border-b border-gray-700 sticky top-[60px] z-30">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors relative ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.badge && tab.badge > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-4 pb-20">
        {/* ===== DASHBOARD ===== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4">
            {/* Stats Grid */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <StatCard icon={Users} label="Total Users" value={stats.total_users} sub={`+${stats.new_users_today} today`} color="blue" />
                <StatCard icon={UserCheck} label="Creators" value={stats.total_creators} color="purple" />
                <StatCard icon={FileText} label="Total Posts" value={stats.total_posts} sub={`+${stats.new_posts_week} this week`} color="green" />
                <StatCard icon={Activity} label="Active Today" value={stats.active_users_today} color="cyan" />
                <StatCard icon={MessageCircle} label="Messages/Week" value={stats.messages_week} color="pink" />
                <StatCard icon={TrendingUp} label="New Users/Week" value={stats.new_users_week} color="orange" />
              </div>
            )}

            {/* Alert Cards */}
            {stats && (stats.pending_applications > 0 || stats.pending_reports > 0 || stats.pending_flagged > 0) && (
              <div className="space-y-2">
                {stats.pending_applications > 0 && (
                  <AlertCard
                    icon={UserCheck}
                    color="yellow"
                    text={`${stats.pending_applications} pending application(s) need review`}
                    onClick={() => setActiveTab('applications')}
                  />
                )}
                {stats.pending_reports > 0 && (
                  <AlertCard
                    icon={Flag}
                    color="orange"
                    text={`${stats.pending_reports} report(s) need attention`}
                    onClick={() => setActiveTab('reports')}
                  />
                )}
                {stats.pending_flagged > 0 && (
                  <AlertCard
                    icon={Shield}
                    color="red"
                    text={`${stats.pending_flagged} flagged content in moderation queue`}
                    onClick={() => setActiveTab('moderation')}
                  />
                )}
              </div>
            )}

            {/* Live Activity Feed */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                Live Activity Feed
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {activityFeed.length === 0 && recentActivity && (
                  <>
                    {recentActivity.recentUsers.slice(0, 5).map((u, i) => (
                      <ActivityItem key={`u-${i}`} type="user" data={u} time={u.created_at} />
                    ))}
                    {recentActivity.recentPosts.slice(0, 5).map((p, i) => (
                      <ActivityItem key={`p-${i}`} type="post" data={p} time={p.created_at} />
                    ))}
                  </>
                )}
                {activityFeed.map((item, i) => (
                  <ActivityItem key={i} type={item.type} data={item.data} time={item.time} />
                ))}
                {activityFeed.length === 0 && !recentActivity && (
                  <p className="text-gray-500 text-sm text-center py-4">Waiting for activity...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ===== USERS ===== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadUsers(1, usersSearch, usersFilter)}
                  placeholder="Search by name, username, or ID..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 rounded-xl border border-gray-700 focus:border-blue-500 outline-none"
                />
              </div>
              <button onClick={() => loadUsers(1, usersSearch, usersFilter)} className="px-4 py-3 bg-blue-600 rounded-xl">
                <Search className="w-5 h-5" />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2">
              {['all', 'creators', 'verified', 'banned'].map(f => (
                <button
                  key={f}
                  onClick={() => { setUsersFilter(f === 'all' ? '' : f); loadUsers(1, usersSearch, f === 'all' ? '' : f) }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                    (usersFilter === f || (usersFilter === '' && f === 'all')) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="text-sm text-gray-400">{usersTotal} users total</div>

            <div className="space-y-2">
              {users.map(user => (
                <div key={user.telegram_id} className="bg-gray-800 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar_url || `https://i.pravatar.cc/150?u=${user.telegram_id}`}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        {user.first_name}
                        {user.is_creator && <span className="text-xs bg-purple-500 px-2 py-0.5 rounded">Creator</span>}
                        {user.is_verified && <span className="text-xs bg-blue-500 px-2 py-0.5 rounded">Verified</span>}
                        {user.is_banned && <span className="text-xs bg-red-500 px-2 py-0.5 rounded">Banned</span>}
                      </div>
                      <div className="text-sm text-gray-400">@{user.username || user.telegram_id}</div>
                    </div>
                  </div>
                  <button onClick={() => handleViewUser(user)} className="p-2 hover:bg-gray-700 rounded-lg">
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            <Pagination page={usersPage} total={usersTotal} limit={20} onPageChange={(p) => loadUsers(p, usersSearch, usersFilter)} />
          </div>
        )}

        {/* ===== MESSAGES ===== */}
        {activeTab === 'messages' && admin.permissions.view_messages && (
          <div className="space-y-4">
            {!selectedConversation ? (
              <>
                <h2 className="text-xl font-bold">All Conversations</h2>
                <div className="space-y-2">
                  {conversations.map(conv => (
                    <div
                      key={conv.id}
                      onClick={() => { setSelectedConversation(conv); loadConversationMessages(conv.id) }}
                      className="bg-gray-800 rounded-xl p-4 cursor-pointer hover:bg-gray-750"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                          <img src={conv.participant1?.avatar_url || `https://i.pravatar.cc/150?u=${conv.participant1_id}`} className="w-8 h-8 rounded-full border-2 border-gray-800" />
                          <img src={conv.participant2?.avatar_url || `https://i.pravatar.cc/150?u=${conv.participant2_id}`} className="w-8 h-8 rounded-full border-2 border-gray-800" />
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm">
                            {conv.participant1?.first_name} & {conv.participant2?.first_name}
                          </div>
                          <div className="text-xs text-gray-400">
                            Last message: {formatTime(conv.last_message_at)}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <button onClick={() => { setSelectedConversation(null); setConversationMessages([]) }} className="p-2 hover:bg-gray-700 rounded-lg">
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-bold">
                    {selectedConversation.participant1?.first_name} & {selectedConversation.participant2?.first_name}
                  </h2>
                </div>
                <div className="bg-gray-800 rounded-xl p-4 max-h-[60vh] overflow-y-auto space-y-3">
                  {conversationMessages.map(msg => (
                    <div key={msg.id} className="flex gap-3">
                      <img src={msg.sender?.avatar_url || `https://i.pravatar.cc/150?u=${msg.sender_id}`} className="w-8 h-8 rounded-full" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{msg.sender?.first_name}</span>
                          <span className="text-xs text-gray-500">{formatTime(msg.created_at)}</span>
                        </div>
                        {msg.content && <p className="text-sm mt-1">{msg.content}</p>}
                        {msg.media_url && (
                          <img src={msg.media_url} className="mt-2 max-w-xs rounded-lg" />
                        )}
                      </div>
                      <button onClick={() => handleDeleteMessage(msg.id)} className="p-1 hover:bg-red-500/20 rounded text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ===== POSTS ===== */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              <button
                onClick={() => { setPostsFilter({}); loadPosts(1, {}) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${Object.keys(postsFilter).length === 0 ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                All
              </button>
              <button
                onClick={() => { setPostsFilter({ is_nsfw: true }); loadPosts(1, { is_nsfw: true }) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${postsFilter.is_nsfw ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                NSFW
              </button>
              <button
                onClick={() => { setPostsFilter({ is_hidden: true }); loadPosts(1, { is_hidden: true }) }}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${postsFilter.is_hidden ? 'bg-yellow-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              >
                Hidden
              </button>
            </div>

            <div className="text-sm text-gray-400">{postsTotal} posts total</div>

            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img src={(post as any).creator?.avatar_url || `https://i.pravatar.cc/150?u=${post.creator_id}`} className="w-8 h-8 rounded-full object-cover" />
                      <div>
                        <div className="font-semibold text-sm">{(post as any).creator?.first_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{formatTime(post.created_at)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {post.is_nsfw && <span className="text-xs bg-red-500 px-2 py-0.5 rounded">NSFW</span>}
                      {post.is_hidden && <span className="text-xs bg-yellow-500 px-2 py-0.5 rounded">Hidden</span>}
                      {post.visibility !== 'public' && <span className="text-xs bg-purple-500 px-2 py-0.5 rounded">{post.visibility}</span>}
                    </div>
                  </div>

                  {post.content && <p className="text-sm mb-3 line-clamp-3">{post.content}</p>}
                  {post.media_url && <img src={post.media_url} className="w-full h-40 object-cover rounded-lg mb-3" />}

                  <div className="flex gap-2">
                    {post.is_hidden ? (
                      <button onClick={() => handleUnhidePost(post.id)} className="flex-1 py-2 bg-green-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                        <Unlock className="w-4 h-4" />
                        Unhide
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          const reason = prompt('Reason for hiding:')
                          if (reason) handleHidePost(post.id, reason)
                        }}
                        className="flex-1 py-2 bg-yellow-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Lock className="w-4 h-4" />
                        Hide
                      </button>
                    )}
                    <button onClick={() => handleDeletePost(post.id)} className="flex-1 py-2 bg-red-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Pagination page={postsPage} total={postsTotal} limit={20} onPageChange={(p) => loadPosts(p, postsFilter)} />
          </div>
        )}

        {/* ===== APPLICATIONS ===== */}
        {activeTab === 'applications' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['pending', 'approved', 'rejected', 'all'].map(status => (
                <button
                  key={status}
                  onClick={() => { setAppFilter(status === 'all' ? '' : status); loadApplications(status === 'all' ? undefined : status) }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                    (appFilter === status || (appFilter === '' && status === 'all')) ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {applications.map(app => (
                <div key={app.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img src={app.user?.avatar_url || `https://i.pravatar.cc/150?u=${app.user_id}`} className="w-10 h-10 rounded-full object-cover" />
                      <div>
                        <div className="font-semibold">{app.legal_name}</div>
                        <div className="text-sm text-gray-400">@{app.user?.username || app.user_id}</div>
                      </div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      app.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                      app.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {app.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div><span className="text-gray-400">Type:</span> <span className={app.content_type === 'nsfw' ? 'text-red-400' : ''}>{app.content_type.toUpperCase()}</span></div>
                    <div><span className="text-gray-400">AI:</span> {app.is_ai_generated ? 'Yes' : 'No'}</div>
                    <div><span className="text-gray-400">Country:</span> {app.country}</div>
                    <div><span className="text-gray-400">Email:</span> {app.email}</div>
                  </div>

                  <div className="text-sm text-gray-400 mb-3">Categories: {app.content_categories?.join(', ') || 'None'}</div>

                  {app.status === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApproveApp(app)} className="flex-1 py-2 bg-green-600 rounded-lg font-semibold flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          const reason = prompt('Rejection reason:')
                          if (reason) handleRejectApp(app, reason)
                        }}
                        className="flex-1 py-2 bg-red-600 rounded-lg font-semibold flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {applications.length === 0 && <div className="text-center text-gray-400 py-8">No applications found</div>}
            </div>
          </div>
        )}

        {/* ===== REPORTS ===== */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['pending', 'reviewing', 'resolved', 'dismissed'].map(status => (
                <button
                  key={status}
                  onClick={() => { setReportFilter(status); loadReports(status) }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${reportFilter === status ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {reports.map(report => (
                <div key={report.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        report.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                        report.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        report.priority === 'normal' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {report.priority}
                      </span>
                      <span className="text-sm font-medium">{report.reason}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatTime(report.created_at)}</span>
                  </div>

                  <div className="text-sm text-gray-400 mb-2">
                    <span className="capitalize">{report.reported_type}</span> #{report.reported_id}
                  </div>

                  {report.description && <p className="text-sm mb-3 line-clamp-2">{report.description}</p>}

                  <div className="flex gap-2">
                    <button onClick={() => handleViewReport(report)} className="flex-1 py-2 bg-gray-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                      <Eye className="w-4 h-4" />
                      View Content
                    </button>
                    {report.status === 'pending' && (
                      <>
                        <button onClick={() => handleResolveReport(report.id, 'resolved')} className="py-2 px-4 bg-green-600 rounded-lg text-sm font-medium">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleResolveReport(report.id, 'dismissed')} className="py-2 px-4 bg-gray-600 rounded-lg text-sm font-medium">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              {reports.length === 0 && <div className="text-center text-gray-400 py-8">No reports found</div>}
            </div>
          </div>
        )}

        {/* ===== MODERATION QUEUE ===== */}
        {activeTab === 'moderation' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {['pending', 'approved', 'rejected'].map(status => (
                <button
                  key={status}
                  onClick={() => { setFlaggedFilter(status); loadFlaggedContent(status) }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${flaggedFilter === status ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {flaggedContent.map(flagged => (
                <div key={flagged.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img src={flagged.user?.avatar_url || `https://i.pravatar.cc/150?u=${flagged.user_id}`} className="w-8 h-8 rounded-full" />
                      <div>
                        <div className="text-sm font-medium">{flagged.user?.first_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400 capitalize">{flagged.content_type} - {formatTime(flagged.created_at)}</div>
                      </div>
                    </div>
                    <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs">AI Flagged</span>
                  </div>

                  <div className="text-sm mb-3">
                    <span className="text-red-400 font-medium">Reason:</span> {flagged.flag_reason}
                  </div>

                  {flagged.media_url && (
                    <div className="mb-3 relative">
                      <img src={flagged.media_url} className="w-full h-48 object-cover rounded-lg blur-lg" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            const img = e.currentTarget.previousElementSibling as HTMLImageElement
                            img.classList.toggle('blur-lg')
                          }}
                          className="px-4 py-2 bg-black/50 rounded-lg text-sm"
                        >
                          Click to reveal
                        </button>
                      </div>
                    </div>
                  )}

                  {flagged.text_content && <p className="text-sm mb-3 bg-gray-900 p-2 rounded">{flagged.text_content}</p>}

                  {flagged.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleReviewFlagged(flagged.id, 'approved', 'Content is acceptable')}
                        className="flex-1 py-2 bg-green-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReviewFlagged(flagged.id, 'rejected', 'Violates guidelines')}
                        className="flex-1 py-2 bg-red-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {flaggedContent.length === 0 && <div className="text-center text-gray-400 py-8">No flagged content</div>}
            </div>
          </div>
        )}

        {/* ===== ANNOUNCEMENTS ===== */}
        {activeTab === 'announcements' && admin.permissions.post_announcements && (
          <div className="space-y-4">
            <button
              onClick={() => setShowAnnouncementForm(true)}
              className="w-full py-3 bg-blue-600 rounded-xl font-semibold flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              New Announcement
            </button>

            <div className="space-y-3">
              {announcements.map(ann => (
                <div key={ann.id} className={`bg-gray-800 rounded-xl p-4 ${!ann.is_active ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        ann.type === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                        ann.type === 'maintenance' ? 'bg-red-500/20 text-red-400' :
                        ann.type === 'promotion' ? 'bg-purple-500/20 text-purple-400' :
                        ann.type === 'update' ? 'bg-green-500/20 text-green-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {ann.type}
                      </span>
                      <span className="text-xs text-gray-400">{ann.target_audience}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleAnnouncement(ann)} className={`p-1 rounded ${ann.is_active ? 'text-green-400' : 'text-gray-500'}`}>
                        {ann.is_active ? <Eye className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDeleteAnnouncement(ann.id)} className="p-1 text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold mb-1">{ann.title}</h3>
                  <p className="text-sm text-gray-400">{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== SETTINGS ===== */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Your Permissions */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Your Permissions</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(admin.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    {value ? <Check className="w-4 h-4 text-green-400" /> : <X className="w-4 h-4 text-red-400" />}
                    <span className="text-gray-400">{key.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Admin Management */}
            {admin.permissions.manage_admins && (
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Admin Users</h3>
                  <button onClick={() => setShowAddAdmin(true)} className="p-2 bg-blue-600 rounded-lg">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {admins.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-2 bg-gray-900 rounded-lg">
                      <div>
                        <div className="font-medium">{a.username || a.telegram_id}</div>
                        <div className="text-xs text-gray-400">{a.role}</div>
                      </div>
                      {a.telegram_id !== admin.telegram_id && (
                        <button onClick={() => handleDeleteAdmin(a.telegram_id)} className="p-1 text-red-400">
                          <UserX className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Activity Log */}
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-3">Recent Admin Activity</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {activityLogs.slice(0, 20).map(log => (
                  <div key={log.id} className="text-sm p-2 bg-gray-900 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-xs text-gray-500">{formatTime(log.created_at)}</span>
                    </div>
                    {log.target_type && (
                      <div className="text-xs text-gray-400">{log.target_type} #{log.target_id}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===== MODALS ===== */}

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <Modal onClose={() => setSelectedUser(null)} title="User Details">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <img src={selectedUser.user.avatar_url || `https://i.pravatar.cc/150?u=${selectedUser.user.telegram_id}`} className="w-16 h-16 rounded-full object-cover" />
                <div>
                  <h4 className="font-bold text-lg">{selectedUser.user.first_name} {selectedUser.user.last_name}</h4>
                  <p className="text-gray-400">@{selectedUser.user.username || selectedUser.user.telegram_id}</p>
                  <p className="text-sm text-gray-500">ID: {selectedUser.user.telegram_id}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xl font-bold">{selectedUser.posts?.length || 0}</div>
                  <div className="text-xs text-gray-400">Posts</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xl font-bold">{selectedUser.followers?.length || 0}</div>
                  <div className="text-xs text-gray-400">Followers</div>
                </div>
                <div className="bg-gray-700 rounded-lg p-3">
                  <div className="text-xl font-bold">{selectedUser.following?.length || 0}</div>
                  <div className="text-xs text-gray-400">Following</div>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Balance</span><span>{selectedUser.user.balance} stars</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Creator</span><span>{selectedUser.user.is_creator ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Verified</span><span>{selectedUser.user.is_verified ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Banned</span><span className={selectedUser.user.is_banned ? 'text-red-400' : ''}>{selectedUser.user.is_banned ? 'Yes' : 'No'}</span></div>
              </div>

              {selectedUser.bans?.length > 0 && (
                <div className="bg-red-500/10 rounded-lg p-3">
                  <h5 className="text-red-400 font-medium mb-2">Ban History</h5>
                  {selectedUser.bans.map((ban: UserBan) => (
                    <div key={ban.id} className="text-sm">
                      <div>{ban.reason}</div>
                      <div className="text-xs text-gray-500">{formatTime(ban.banned_at)}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t border-gray-700">
                {selectedUser.user.is_banned ? (
                  <button onClick={() => handleUnbanUser(selectedUser.user.telegram_id)} className="flex-1 py-3 bg-green-600 rounded-xl font-semibold flex items-center justify-center gap-2">
                    <Unlock className="w-4 h-4" />
                    Unban
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const reason = prompt('Ban reason:')
                      if (reason) handleBanUser(selectedUser.user.telegram_id, reason, true)
                    }}
                    className="flex-1 py-3 bg-red-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                  >
                    <Ban className="w-4 h-4" />
                    Ban User
                  </button>
                )}
                <button
                  onClick={async () => {
                    await adminUpdateUser(selectedUser.user.telegram_id, { is_creator: true, is_verified: true }, admin.telegram_id)
                    alert('User is now a verified creator')
                    setSelectedUser(null)
                    loadUsers(usersPage, usersSearch, usersFilter)
                  }}
                  className="flex-1 py-3 bg-purple-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <UserCheck className="w-4 h-4" />
                  Make Creator
                </button>
              </div>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Report Detail Modal */}
      <AnimatePresence>
        {selectedReport && (
          <Modal onClose={() => { setSelectedReport(null); setReportedContent(null) }} title="Report Details">
            <div className="space-y-4">
              <div className="bg-gray-700 rounded-lg p-3">
                <div className="text-sm">
                  <span className="text-gray-400">Reported:</span> <span className="capitalize">{selectedReport.reported_type}</span> #{selectedReport.reported_id}
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Reason:</span> {selectedReport.reason}
                </div>
                <div className="text-sm">
                  <span className="text-gray-400">Priority:</span> <span className={
                    selectedReport.priority === 'critical' ? 'text-red-400' :
                    selectedReport.priority === 'high' ? 'text-orange-400' : ''
                  }>{selectedReport.priority}</span>
                </div>
              </div>

              {selectedReport.description && (
                <div>
                  <h5 className="text-sm text-gray-400 mb-1">Description:</h5>
                  <p className="text-sm bg-gray-700 p-2 rounded">{selectedReport.description}</p>
                </div>
              )}

              {reportedContent && (
                <div>
                  <h5 className="text-sm text-gray-400 mb-1">Content:</h5>
                  <div className="bg-gray-700 p-3 rounded-lg">
                    {selectedReport.reported_type === 'post' && (
                      <>
                        {reportedContent.content && <p className="text-sm mb-2">{reportedContent.content}</p>}
                        {reportedContent.media_url && <img src={reportedContent.media_url} className="max-h-48 rounded" />}
                      </>
                    )}
                    {selectedReport.reported_type === 'user' && (
                      <div className="flex items-center gap-3">
                        <img src={reportedContent.avatar_url} className="w-12 h-12 rounded-full" />
                        <div>
                          <div className="font-medium">{reportedContent.first_name}</div>
                          <div className="text-sm text-gray-400">@{reportedContent.username}</div>
                        </div>
                      </div>
                    )}
                    {selectedReport.reported_type === 'message' && (
                      <p className="text-sm">{reportedContent.content}</p>
                    )}
                  </div>
                </div>
              )}

              {selectedReport.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResolveReport(selectedReport.id, 'resolved', 'Action taken')}
                    className="flex-1 py-3 bg-green-600 rounded-xl font-semibold"
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => handleResolveReport(selectedReport.id, 'dismissed', 'Not a violation')}
                    className="flex-1 py-3 bg-gray-600 rounded-xl font-semibold"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Announcement Form Modal */}
      <AnimatePresence>
        {showAnnouncementForm && (
          <Modal onClose={() => setShowAnnouncementForm(false)} title="New Announcement">
            <div className="space-y-4">
              <input
                type="text"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Title"
                className="w-full px-4 py-3 bg-gray-700 rounded-xl border border-gray-600 focus:border-blue-500 outline-none"
              />
              <textarea
                value={announcementForm.content}
                onChange={(e) => setAnnouncementForm(f => ({ ...f, content: e.target.value }))}
                placeholder="Content..."
                rows={4}
                className="w-full px-4 py-3 bg-gray-700 rounded-xl border border-gray-600 focus:border-blue-500 outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <select
                  value={announcementForm.type}
                  onChange={(e) => setAnnouncementForm(f => ({ ...f, type: e.target.value }))}
                  className="px-4 py-3 bg-gray-700 rounded-xl border border-gray-600"
                >
                  <option value="info">Info</option>
                  <option value="update">Update</option>
                  <option value="warning">Warning</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="promotion">Promotion</option>
                </select>
                <select
                  value={announcementForm.targetAudience}
                  onChange={(e) => setAnnouncementForm(f => ({ ...f, targetAudience: e.target.value }))}
                  className="px-4 py-3 bg-gray-700 rounded-xl border border-gray-600"
                >
                  <option value="all">All Users</option>
                  <option value="creators">Creators Only</option>
                  <option value="subscribers">Subscribers</option>
                  <option value="new_users">New Users</option>
                </select>
              </div>
              <button onClick={handleCreateAnnouncement} className="w-full py-3 bg-blue-600 rounded-xl font-semibold">
                Post Announcement
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>

      {/* Add Admin Modal */}
      <AnimatePresence>
        {showAddAdmin && (
          <Modal onClose={() => setShowAddAdmin(false)} title="Add Admin">
            <div className="space-y-4">
              <input
                type="text"
                value={newAdminForm.telegramId}
                onChange={(e) => setNewAdminForm(f => ({ ...f, telegramId: e.target.value }))}
                placeholder="Telegram ID"
                className="w-full px-4 py-3 bg-gray-700 rounded-xl border border-gray-600 focus:border-blue-500 outline-none"
              />
              <input
                type="text"
                value={newAdminForm.username}
                onChange={(e) => setNewAdminForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Username"
                className="w-full px-4 py-3 bg-gray-700 rounded-xl border border-gray-600 focus:border-blue-500 outline-none"
              />
              <select
                value={newAdminForm.role}
                onChange={(e) => setNewAdminForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-4 py-3 bg-gray-700 rounded-xl border border-gray-600"
              >
                <option value="moderator">Moderator</option>
                <option value="admin">Admin</option>
                <option value="super_admin">Super Admin</option>
              </select>
              <button onClick={handleAddAdmin} className="w-full py-3 bg-blue-600 rounded-xl font-semibold">
                Add Admin
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  )
}

// ===== HELPER COMPONENTS =====

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: number; sub?: string; color: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-400',
    purple: 'text-purple-400',
    green: 'text-green-400',
    cyan: 'text-cyan-400',
    pink: 'text-pink-400',
    orange: 'text-orange-400',
  }
  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className={`flex items-center gap-2 ${colors[color]} text-sm mb-1`}>
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className="text-2xl font-bold">{value.toLocaleString()}</div>
      {sub && <div className="text-xs text-green-400">{sub}</div>}
    </div>
  )
}

function AlertCard({ icon: Icon, color, text, onClick }: { icon: any; color: string; text: string; onClick: () => void }) {
  const colors: Record<string, string> = {
    yellow: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    orange: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
    red: 'bg-red-500/20 border-red-500/30 text-red-400',
  }
  return (
    <button onClick={onClick} className={`w-full p-4 border rounded-xl flex items-center justify-between ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5" />
        <span>{text}</span>
      </div>
      <ChevronRight className="w-5 h-5" />
    </button>
  )
}

function ActivityItem({ type, data, time }: { type: string; data: any; time: string | Date }) {
  const icons: Record<string, any> = {
    user: Users,
    post: FileText,
    message: MessageCircle,
    report: Flag,
    flagged: Shield,
    application: UserCheck,
  }
  const Icon = icons[type] || Activity
  const labels: Record<string, string> = {
    user: 'New user registered',
    post: 'New post created',
    message: 'New message sent',
    report: 'New report submitted',
    flagged: 'Content flagged by AI',
    application: 'New creator application',
  }

  const formatTime = (date: string | Date) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    return d.toLocaleTimeString()
  }

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-900 rounded-lg">
      <div className={`p-2 rounded-lg ${
        type === 'report' || type === 'flagged' ? 'bg-red-500/20' :
        type === 'user' ? 'bg-blue-500/20' :
        type === 'application' ? 'bg-yellow-500/20' :
        'bg-gray-700'
      }`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{labels[type]}</div>
        <div className="text-xs text-gray-500">{data?.first_name || data?.username || `#${data?.id}`}</div>
      </div>
      <div className="text-xs text-gray-500">{formatTime(time)}</div>
    </div>
  )
}

function Pagination({ page, total, limit, onPageChange }: { page: number; total: number; limit: number; onPageChange: (p: number) => void }) {
  const totalPages = Math.ceil(total / limit)
  if (totalPages <= 1) return null

  return (
    <div className="flex justify-center gap-2 mt-4">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        className="px-4 py-2 bg-gray-800 rounded-lg disabled:opacity-50"
      >
        Previous
      </button>
      <span className="px-4 py-2">Page {page} of {totalPages}</span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-4 py-2 bg-gray-800 rounded-lg disabled:opacity-50"
      >
        Next
      </button>
    </div>
  )
}

function Modal({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  return (
    <motion.div
      className="fixed inset-0 bg-black/80 z-50 overflow-y-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="min-h-screen p-4 flex items-start justify-center pt-20">
        <motion.div
          className="bg-gray-800 rounded-2xl max-w-lg w-full"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-lg">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-gray-700 rounded-lg">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4">{children}</div>
        </motion.div>
      </div>
    </motion.div>
  )
}
