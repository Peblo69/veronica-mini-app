import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, FileText, Shield, BarChart3, Search, ChevronRight,
  Check, X, Eye, Trash2, Ban, UserCheck, AlertTriangle,
  Lock, Settings, RefreshCw, ArrowLeft
} from 'lucide-react'
import {
  checkIsAdmin, getAllUsers, getUserDetails, adminUpdateUser,
  banUser, unbanUser, getAllPosts, hidePost, deletePost,
  getApplications, approveApplication, rejectApplication,
  getPlatformStats, type AdminUser, type CreatorApplication, type PlatformStats
} from '../lib/adminApi'
import { type User, type Post } from '../lib/api'

interface AdminPageProps {
  telegramId: number
  onExit: () => void
}

type Tab = 'dashboard' | 'users' | 'applications' | 'posts' | 'reports' | 'settings'

export default function AdminPage({ telegramId, onExit }: AdminPageProps) {
  const [admin, setAdmin] = useState<AdminUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  // Dashboard
  const [stats, setStats] = useState<PlatformStats | null>(null)

  // Users
  const [users, setUsers] = useState<User[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [usersPage, setUsersPage] = useState(1)
  const [usersSearch, setUsersSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)

  // Applications
  const [applications, setApplications] = useState<CreatorApplication[]>([])
  const [appFilter, setAppFilter] = useState<string>('pending')

  // Posts
  const [posts, setPosts] = useState<Post[]>([])
  const [postsTotal, setPostsTotal] = useState(0)
  const [postsPage, setPostsPage] = useState(1)

  useEffect(() => {
    checkAdminAccess()
  }, [])

  const checkAdminAccess = async () => {
    const adminUser = await checkIsAdmin(telegramId)
    if (adminUser) {
      setAdmin(adminUser)
      loadDashboard()
    }
    setLoading(false)
  }

  const loadDashboard = async () => {
    const platformStats = await getPlatformStats()
    setStats(platformStats)
  }

  const loadUsers = async (page = 1, search?: string) => {
    const { users: userData, total } = await getAllUsers(page, 20, search)
    setUsers(userData)
    setUsersTotal(total)
    setUsersPage(page)
  }

  const loadApplications = async (status?: string) => {
    const apps = await getApplications(status)
    setApplications(apps)
  }

  const loadPosts = async (page = 1) => {
    const { posts: postsData, total } = await getAllPosts(page)
    setPosts(postsData)
    setPostsTotal(total)
    setPostsPage(page)
  }

  const handleViewUser = async (user: User) => {
    const details = await getUserDetails(user.telegram_id)
    setSelectedUser(details)
  }

  const handleBanUser = async (userId: number, reason: string) => {
    if (admin) {
      await banUser(userId, reason, admin.id)
      loadUsers(usersPage, usersSearch)
      setSelectedUser(null)
    }
  }

  const handleUnbanUser = async (userId: number) => {
    await unbanUser(userId)
    loadUsers(usersPage, usersSearch)
    setSelectedUser(null)
  }
  // Use handleUnbanUser reference to avoid unused warning
  void handleUnbanUser

  const handleApproveApp = async (app: CreatorApplication) => {
    await approveApplication(app.id, app.user_id)
    loadApplications(appFilter)
  }

  const handleRejectApp = async (app: CreatorApplication, reason: string) => {
    await rejectApplication(app.id, app.user_id, reason)
    loadApplications(appFilter)
  }

  const handleHidePost = async (postId: number, reason: string) => {
    if (admin) {
      await hidePost(postId, reason, admin.id)
      loadPosts(postsPage)
    }
  }

  const handleDeletePost = async (postId: number) => {
    if (confirm('Permanently delete this post? This cannot be undone.')) {
      await deletePost(postId)
      loadPosts(postsPage)
    }
  }

  useEffect(() => {
    if (admin) {
      if (activeTab === 'users') loadUsers()
      if (activeTab === 'applications') loadApplications(appFilter)
      if (activeTab === 'posts') loadPosts()
    }
  }, [activeTab, admin])

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
          <button
            onClick={onExit}
            className="px-6 py-3 bg-gray-700 text-white rounded-xl font-semibold"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="p-2 hover:bg-gray-700 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-lg">Admin Panel</h1>
            <p className="text-xs text-gray-400">Logged in as {admin.username} ({admin.role})</p>
          </div>
        </div>
        <button onClick={loadDashboard} className="p-2 hover:bg-gray-700 rounded-lg">
          <RefreshCw className="w-5 h-5" />
        </button>
      </header>

      {/* Tab Navigation */}
      <nav className="bg-gray-800 px-2 py-2 flex gap-1 overflow-x-auto border-b border-gray-700">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
          { id: 'users', label: 'Users', icon: Users },
          { id: 'applications', label: 'Applications', icon: FileText },
          { id: 'posts', label: 'Posts', icon: FileText },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <main className="p-4">
        {/* Dashboard */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Platform Overview</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <Users className="w-4 h-4" />
                  Total Users
                </div>
                <div className="text-2xl font-bold">{stats.total_users}</div>
                <div className="text-xs text-green-400">+{stats.new_users_today} today</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <UserCheck className="w-4 h-4" />
                  Creators
                </div>
                <div className="text-2xl font-bold">{stats.total_creators}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <FileText className="w-4 h-4" />
                  Total Posts
                </div>
                <div className="text-2xl font-bold">{stats.total_posts}</div>
              </div>
              <div className="bg-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                  <AlertTriangle className="w-4 h-4" />
                  Pending
                </div>
                <div className="text-2xl font-bold text-yellow-400">{stats.pending_applications}</div>
                <div className="text-xs text-gray-400">applications</div>
              </div>
            </div>

            {stats.pending_applications > 0 && (
              <button
                onClick={() => setActiveTab('applications')}
                className="w-full p-4 bg-yellow-500/20 border border-yellow-500/30 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  <span>{stats.pending_applications} pending application(s) need review</span>
                </div>
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Users */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={usersSearch}
                  onChange={(e) => setUsersSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadUsers(1, usersSearch)}
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-3 bg-gray-800 rounded-xl border border-gray-700 focus:border-blue-500 outline-none"
                />
              </div>
              <button
                onClick={() => loadUsers(1, usersSearch)}
                className="px-4 py-3 bg-blue-600 rounded-xl"
              >
                <Search className="w-5 h-5" />
              </button>
            </div>

            <div className="text-sm text-gray-400">{usersTotal} users total</div>

            <div className="space-y-2">
              {users.map(user => (
                <div
                  key={user.telegram_id}
                  className="bg-gray-800 rounded-xl p-4 flex items-center justify-between"
                >
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
                      </div>
                      <div className="text-sm text-gray-400">@{user.username || user.telegram_id}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleViewUser(user)}
                    className="p-2 hover:bg-gray-700 rounded-lg"
                  >
                    <Eye className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            {usersTotal > 20 && (
              <div className="flex justify-center gap-2">
                <button
                  onClick={() => loadUsers(usersPage - 1, usersSearch)}
                  disabled={usersPage === 1}
                  className="px-4 py-2 bg-gray-800 rounded-lg disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-4 py-2">Page {usersPage}</span>
                <button
                  onClick={() => loadUsers(usersPage + 1, usersSearch)}
                  disabled={usersPage * 20 >= usersTotal}
                  className="px-4 py-2 bg-gray-800 rounded-lg disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Applications */}
        {activeTab === 'applications' && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto">
              {['pending', 'approved', 'rejected', 'all'].map(status => (
                <button
                  key={status}
                  onClick={() => {
                    setAppFilter(status === 'all' ? '' : status)
                    loadApplications(status === 'all' ? undefined : status)
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                    (appFilter === status || (appFilter === '' && status === 'all'))
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {applications.map(app => (
                <div
                  key={app.id}
                  className="bg-gray-800 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={app.user?.avatar_url || `https://i.pravatar.cc/150?u=${app.user_id}`}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
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
                    <div>
                      <span className="text-gray-400">Type:</span>{' '}
                      <span className={app.content_type === 'nsfw' ? 'text-red-400' : ''}>{app.content_type.toUpperCase()}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">AI:</span>{' '}
                      <span>{app.is_ai_generated ? 'Yes' : 'No'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Country:</span> {app.country}
                    </div>
                    <div>
                      <span className="text-gray-400">Email:</span> {app.email}
                    </div>
                  </div>

                  <div className="text-sm text-gray-400 mb-3">
                    Categories: {app.content_categories?.join(', ') || 'None'}
                  </div>

                  {app.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveApp(app)}
                        className="flex-1 py-2 bg-green-600 rounded-lg font-semibold flex items-center justify-center gap-2"
                      >
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

              {applications.length === 0 && (
                <div className="text-center text-gray-400 py-8">
                  No applications found
                </div>
              )}
            </div>
          </div>
        )}

        {/* Posts */}
        {activeTab === 'posts' && (
          <div className="space-y-4">
            <div className="text-sm text-gray-400">{postsTotal} posts total</div>

            <div className="space-y-3">
              {posts.map(post => (
                <div key={post.id} className="bg-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={(post as any).creator?.avatar_url || `https://i.pravatar.cc/150?u=${post.creator_id}`}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                      <div>
                        <div className="font-semibold text-sm">{(post as any).creator?.first_name || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{new Date(post.created_at).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {post.is_nsfw && <span className="text-xs bg-red-500 px-2 py-0.5 rounded">NSFW</span>}
                      {post.visibility !== 'public' && <span className="text-xs bg-purple-500 px-2 py-0.5 rounded">{post.visibility}</span>}
                    </div>
                  </div>

                  {post.content && (
                    <p className="text-sm mb-3 line-clamp-3">{post.content}</p>
                  )}

                  {post.media_url && (
                    <img src={post.media_url} alt="" className="w-full h-32 object-cover rounded-lg mb-3" />
                  )}

                  <div className="flex gap-2">
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
                    <button
                      onClick={() => handleDeletePost(post.id)}
                      className="flex-1 py-2 bg-red-600 rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Admin Settings</h2>
            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-2">Your Permissions</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {Object.entries(admin.permissions).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2">
                    {value ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <X className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-gray-400">{key.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gray-800 rounded-xl p-4">
              <h3 className="font-semibold mb-2">Session Info</h3>
              <div className="text-sm text-gray-400 space-y-1">
                <p>Telegram ID: {admin.telegram_id}</p>
                <p>Role: {admin.role}</p>
                <p>Last Login: {admin.last_login ? new Date(admin.last_login).toLocaleString() : 'First login'}</p>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* User Detail Modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            className="fixed inset-0 bg-black/80 z-50 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="min-h-screen p-4">
              <div className="bg-gray-800 rounded-2xl max-w-lg mx-auto">
                <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                  <h3 className="font-bold text-lg">User Details</h3>
                  <button onClick={() => setSelectedUser(null)} className="p-2 hover:bg-gray-700 rounded-lg">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-4">
                    <img
                      src={selectedUser.user.avatar_url || `https://i.pravatar.cc/150?u=${selectedUser.user.telegram_id}`}
                      alt=""
                      className="w-16 h-16 rounded-full object-cover"
                    />
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
                    <div className="flex justify-between">
                      <span className="text-gray-400">Balance</span>
                      <span>{selectedUser.user.balance} tokens</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Creator</span>
                      <span>{selectedUser.user.is_creator ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Verified</span>
                      <span>{selectedUser.user.is_verified ? 'Yes' : 'No'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Subscription Price</span>
                      <span>${selectedUser.user.subscription_price || 0}/mo</span>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-gray-700">
                    <button
                      onClick={() => {
                        const reason = prompt('Ban reason:')
                        if (reason) handleBanUser(selectedUser.user.telegram_id, reason)
                      }}
                      className="flex-1 py-3 bg-red-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                    >
                      <Ban className="w-4 h-4" />
                      Ban User
                    </button>
                    <button
                      onClick={() => {
                        adminUpdateUser(selectedUser.user.telegram_id, { is_creator: true, is_verified: true })
                        alert('User is now a verified creator')
                        setSelectedUser(null)
                        loadUsers(usersPage, usersSearch)
                      }}
                      className="flex-1 py-3 bg-green-600 rounded-xl font-semibold flex items-center justify-center gap-2"
                    >
                      <UserCheck className="w-4 h-4" />
                      Make Creator
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
