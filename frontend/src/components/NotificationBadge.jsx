import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { Bell, ShoppingCart, Mail, Check, Inbox } from 'lucide-react';

export default function NotificationBadge() {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch functions
  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('notifications/unread-count/');
      setUnreadCount(res.data.unread_count);
    } catch (err) {
      console.error('Error fetching unread count:', err);
    }
  };

  const fetchRecentNotifications = async () => {
    try {
      const res = await api.get('notifications/');
      // django returns pagination or direct list
      const list = res.data.results || res.data;
      setNotifications(list.slice(0, 10)); // Show top 10 recent
    } catch (err) {
      console.error('Error fetching recent notifications:', err);
    }
  };

  // Poll count every 30 seconds
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Whenever dropdown opens, load recent list and refresh count
  useEffect(() => {
    if (isOpen) {
      fetchRecentNotifications();
      fetchUnreadCount();
    }
  }, [isOpen]);

  const handleNotificationClick = async (notif) => {
    try {
      // Mark as read
      await api.patch(`notifications/${notif.id}/mark-read/`);
      fetchUnreadCount();
      setIsOpen(false);
      
      // Route accordingly
      if (notif.notification_type === 'ORDER') {
        navigate('/dashboard/orders');
      } else if (notif.notification_type === 'MESSAGE') {
        navigate('/dashboard/messages');
      }
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.post('notifications/mark-all-read/');
      fetchUnreadCount();
      // Update local state is_read to true
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  return (
    <div className="relative font-cairo" ref={dropdownRef} dir="rtl">
      {/* Bell Icon Toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-white/5 border border-white/10 text-surface-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer flex items-center justify-center h-10 w-10 focus:outline-none"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -left-1 bg-dal-red text-white text-[10px] font-black rounded-full w-5 h-5 flex items-center justify-center animate-pulse border border-surface-950 font-mono">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Card */}
      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 sm:w-96 bg-surface-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl z-50 overflow-hidden animate-fade-in text-right">
          
          {/* Header */}
          <div className="p-4 border-b border-white/5 flex items-center justify-between bg-surface-950/40">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white">إشعارات النظام</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-dal-red/10 text-dal-red text-[10px] font-bold">
                  {unreadCount} جديد
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary-400 hover:text-primary-300 font-semibold cursor-pointer flex items-center gap-1 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                تعيين المقروء للكل
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-white/5 scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-surface-550 space-y-2">
                <Inbox className="w-8 h-8 mx-auto text-surface-600 opacity-60" />
                <p className="text-xs">لا توجد إشعارات حالياً</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-4 transition-all duration-200 cursor-pointer flex items-start gap-3 hover:bg-white/[0.03] ${
                    !notif.is_read ? 'bg-primary-500/[0.03] border-r-2 border-primary-500' : ''
                  }`}
                >
                  {/* Icon depending on type */}
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    notif.notification_type === 'ORDER'
                      ? 'bg-success-500/10 text-success-400 border border-success-500/20'
                      : 'bg-accent-500/10 text-accent-400 border border-accent-500/20'
                  }`}>
                    {notif.notification_type === 'ORDER' ? (
                      <ShoppingCart className="w-4 h-4" />
                    ) : (
                      <Mail className="w-4 h-4" />
                    )}
                  </div>

                  {/* Text details */}
                  <div className="flex-1 space-y-1">
                    <p className={`text-xs leading-relaxed text-surface-200 ${!notif.is_read ? 'font-bold text-white' : ''}`}>
                      {notif.message}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-surface-500">
                        {new Date(notif.created_at).toLocaleString('ar-SA', {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'numeric'
                        })}
                      </span>
                      {!notif.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary-400" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
