"use client";

import { GLIMPSE_CHAT_VERSION, MEDIA_LIMITS, TRANSLATION_LANGUAGE_OPTIONS, type ArchivePreviewResponse, type AuthResponse, type CallMediaKind, type CallSignalEvent, type CallSignalPayload, type ConversationHistoryResponse, type ConversationSummary, type GroupMemberSummary, type MessagePayload, type PublicUser, type TranslationLanguage, type UploadedMediaResponse, type UserLanguage } from "@glimpse/shared";
import { FormEvent, PointerEvent as ReactPointerEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Ban, Bell, Check, CheckCheck, Copy, Globe2, Download, FileText, Languages, MapPin, Maximize2, MessageCircle, Mic, MicOff, Minimize2, Music2, Paperclip, Phone, PhoneOff, Plus, Navigation, RefreshCw, Reply, RotateCcw, RotateCw, Search, Send, Settings, UserPlus, Users, Video, VideoOff, Volume2 } from "lucide-react";
import { io, Socket } from "socket.io-client";

type Tab = "chats" | "contacts" | "me";
type MobilePane = "list" | "chat";
type UiLanguage = "zh" | "en";
type MessageSendStatus = "sending" | "sent" | "delivered" | "read" | "failed";
type ConnectionState = "connected" | "reconnecting" | "offline";
type MessageLoadState = "loading" | "ready" | "failed";
type MessageDisplayMode = "original" | "translated" | "bilingual";
type SpeechAccent = "auto" | "en-IN" | "en-US" | "en-GB" | "zh-CN" | "zh-TW" | "hi-IN" | "ta-IN" | "te-IN" | "bn-IN" | "ar-SA" | "ur-PK" | "ja-JP" | "ko-KR";
type PendingAutoTranslation = { message: MessagePayload; targetLanguage: TranslationLanguage };
type ReplyDraft = { id: string; senderName?: string; type: MessagePayload["type"]; body?: string };
type MediaPreview = { url: string; type: "image" | "video" | "audio" | "avatar" | "pdf"; name?: string; muted?: boolean; downloadUrl?: string };
type ArchivePreviewState = ArchivePreviewResponse & { loading?: boolean; error?: string };
type PendingVoicePreview = { file: File; url: string; transcript: string; name: string };
type MessageReminder = { id: string; conversationId: string; messageId: string; title: string; body: string; remindAt: string; done?: boolean };
type LocationMessagePayload = { latitude: number; longitude: number; name?: string; address?: string };
type MediaLibraryFilter = "all" | "image" | "video" | "audio" | "file";
type MessageSearchType = "all" | "text" | "image" | "video" | "audio" | "file";
type VideoFitMode = "auto" | "portraitRight" | "portraitLeft" | "landscape";
type CallStatus = "ringing" | "connecting" | "active";
type ActiveCall = { callId: string; conversationId: string; media: CallMediaKind; status: CallStatus; direction: "incoming" | "outgoing"; peerName: string; startedAt: number; muted: boolean; cameraOff: boolean };
type IncomingCall = { callId: string; conversationId: string; media: CallMediaKind; fromUserId: string; fromName?: string; signalType: "join" | "offer"; sdp?: string };
type RemoteCallStream = { userId: string; name: string; stream: MediaStream; media: CallMediaKind; cameraOff?: boolean };
type CameraFacingMode = "user" | "environment";
type CallTileView = { id: string; name: string; stream: MediaStream | null; muted: boolean; videoEnabled: boolean; avatarUrl?: string | null; isLocal?: boolean };
type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string }; isFinal?: boolean }> }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

const LOCATION_MESSAGE_PREFIX = "glimpse-location:v1:";

type Conversation = {
  id: string;
  name: string;
  preview: string;
  time: string;
  latestMessageAt?: string;
  unread: number;
  avatarUrl?: string | null;
  announcement?: string | null;
  announcementScroll?: boolean | null;
  ownerId?: string | null;
  memberCount?: number;
  otherUser?: SearchUser;
  type: "single" | "group";
  language: UiLanguage;
  online?: boolean;
};

type SearchUser = PublicUser & {
  email?: string | null;
  phone?: string | null;
};

type BlockedUserView = {
  id: string;
  user: SearchUser;
  createdAt: string;
};
type FriendRequestView = {
  id: string;
  status: "pending" | "accepted" | "rejected";
  direction: "incoming" | "outgoing";
  user: SearchUser;
  createdAt: string;
  updatedAt: string;
};

const initialConversations: Conversation[] = [
  {
    id: "1",
    name: "Aarav Mehta",
    preview: "The translated contract draft looks good.",
    time: "10:42",
    unread: 2,
    type: "single",
    language: "en"
  },
  {
    id: "2",
    name: "Mumbai Ops Team",
    preview: "Please confirm the shipment list this afternoon.",
    time: "09:18",
    unread: 5,
    type: "group",
    language: "en"
  },
  {
    id: "3",
    name: "Li Wei",
    preview: "Let's review the sample photos.",
    time: "Yesterday",
    unread: 0,
    type: "single",
    language: "en"
  }
];

const defaultConversation = initialConversations[0] as Conversation;

const initialMessages: Record<string, MessagePayload[]> = {
  "1": [
    {
      id: "m1",
      conversationId: "1",
      senderId: "demo-aarav",
      senderName: "Aarav",
      type: "text",
      body: "Can we confirm the delivery window today?",
      translations: { zh: "我们今天可以确认交付时间窗口吗？" },
      createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString()
    },
    {
      id: "m2",
      conversationId: "1",
      senderId: "demo-me",
      senderName: "Me",
      type: "text",
      body: "可以，我会在下午三点前发你最终版本。",
      translations: { en: "Yes, I will send you the final version before 3 PM." },
      createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
    }
  ],
  "2": [
    {
      id: "m3",
      conversationId: "2",
      senderId: "demo-priya",
      senderName: "Priya",
      type: "text",
      body: "Please send the customs documents before lunch.",
      translations: { zh: "请在午饭前发送清关文件。" },
      createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString()
    }
  ],
  "3": [
    {
      id: "m4",
      conversationId: "3",
      senderId: "demo-liwei",
      senderName: "Li Wei",
      type: "text",
      body: "样品照片已经上传，请确认颜色。",
      translations: { en: "The sample photos have been uploaded. Please confirm the color." },
      createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString()
    }
  ]
};
const copy = {
  zh: {
    subtitle: "中英互译 · Web/PWA",
    search: "按邮箱、手机号或昵称搜索",
    chats: "聊天",
    contacts: "联系人",
    me: "我的",
    auto: "服务器翻译已启用；公网测试前仍需验证语言范围和失败兜底",
    details: "详情",
    input: "输入消息...",
    attach: "发送图片、视频、音频或文件",
    uploadingMedia: "正在上传...",
    mediaUnsupported: "不支持该文件。请换一个文件重试。",
    mediaTooLarge: "文件超过允许大小。",
    mediaUploadFailed: "媒体上传失败，请重试。",
    mediaOpen: "打开预览",
    mediaClose: "关闭预览",
    pdfPreview: "预览 PDF",
    rotateLeft: "左旋",
    rotateRight: "右旋",
    videoFitAuto: "自动",
    videoFitPortrait: "竖屏右转",
    videoFitPortraitAlt: "竖屏左转",
    videoFitLandscape: "横屏",
    uploadRetry: "重新上传",
    uploadCancel: "取消上传",
    mediaVideoTooLong: "视频不能超过 5 分钟。",
    mediaFiles: "聊天资料",
    mediaAll: "全部",
    mediaImages: "图片",
    mediaVideos: "视频",
    mediaAudios: "音频",
    mediaDocs: "文件",
    mediaEmpty: "这一类暂时没有资料。",
    mediaLoadOlder: "加载更早消息",
    mediaLocate: "定位到聊天位置",
    pinConversation: "置顶聊天",
    unpinConversation: "取消置顶",
    deleteChat: "删除聊天",
    chatDeleted: "聊天已从列表移除。",
    chatPinned: "聊天已置顶。",
    chatUnpinned: "已取消置顶。",
    voiceRecordStart: "录音",
    voiceRecordStop: "发送语音",
    voiceRecording: "录音中...",
    voiceRecordFailed: "语音录制失败，请检查麦克风权限。",
    voiceTranscript: "转文字",
    voiceTranscriptEmpty: "这条语音暂无可用文字。",
    voiceTranscriptHide: "收起文字",
    voicePreviewReady: "语音已录好，请试听后确认发送。",
    voiceSendConfirm: "发送",
    voiceCancel: "取消",
    messageRevoked: "消息已撤回",
    revokeMessage: "撤回",
    revokeFailed: "撤回失败或已超过允许时间。",
    downloadOriginal: "下载原文件",    settings: "设置",
    translationTarget: "翻译语言",
    displayMode: "消息显示",
    speechAccent: "朗读口音",
    speechAccentAuto: "跟随消息语言",
    originalOnly: "原文",
    translatedOnly: "译文",
    bilingual: "双语",
    notifications: "新消息提醒",
    notificationsHint: "未打开当前聊天窗口时弹出系统通知。",
    notificationSound: "提示音",
    notificationVibration: "手机振动",
    notificationPermission: "浏览器通知权限需要在首次开启时允许。",
    changePasswordTitle: "修改密码",
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    profileSettingsTitle: "个人设置",
    showSenderNames: "聊天窗口显示发信人名字",
    profileNickname: "昵称",
    profileCompany: "公司",
    profileTitle: "职位",
    profileLocation: "地区",
    profileBio: "个人简介",
    profileSignature: "个性签名",
    profileEmail: "邮箱",
    profilePhone: "电话",
    profilePublicId: "ID",
    profilePublic: "公开个人资料",
    profileEmailPublic: "公开邮箱",
    profilePhonePublic: "公开电话",
    profileIdHint: "ID 可用于搜索你。3-32 位，只能包含字母、数字、点、下划线或短横线；半年内只能修改一次。",
    profileRole: "角色",
    profileLanguage: "界面语言",
    profileAvatar: "头像",
    uploadAvatar: "上传头像",
    cropAvatarTitle: "裁剪头像",
    cropAvatarConfirm: "使用头像",
    cropAvatarCancel: "取消",
    cropAvatarZoom: "缩放",
    saveProfile: "保存",
    editProfile: "编辑",
    editSignature: "编辑",
    saveSignature: "保存",
    registeredInfo: "注册与个人资料",
    profileSaved: "个人资料已保存。",
    profileSaveFailed: "个人资料保存失败。",
    viewContactDetails: "详情",
    contactDetailsTitle: "联系人详情",
    contactDetailsEmpty: "对方暂未填写公开资料",
    updatePassword: "更新密码",
    passwordUpdated: "密码已更新。",
    passwordMismatch: "两次输入的新密码不一致。",
    passwordTooShort: "新密码至少需要 8 个字符。",
    passwordChangeFailed: "密码修改失败，请检查当前密码。",
    feedbackTitle: "反馈",
    feedbackHint: "告诉我们你遇到的问题或建议。",
    feedbackPlaceholder: "请输入反馈内容...",
    feedbackSend: "提交反馈",
    feedbackSending: "提交中...",
    feedbackSent: "反馈已提交。",
    feedbackTooShort: "反馈内容至少需要 5 个字符。",
    feedbackFailed: "反馈提交失败，请稍后重试。",
    feedbackAttach: "添加问题截图",
    feedbackAttachmentReady: "截图已添加。",
    feedbackAttachmentRemove: "移除截图",
    versionLabel: "版本",
    adminDashboard: "管理后台",
    adminLoad: "打开管理后台",
    adminClose: "关闭",
    adminSearchUsers: "搜索用户",
    adminSearchFeedback: "搜索反馈",
    adminSearchConversations: "搜索会话",
    adminNoResults: "没有匹配结果",
    adminUsers: "用户",
    adminConversations: "会话",
    adminMessages: "消息",
    adminOpenFeedback: "待处理反馈",
    adminDisabledUsers: "停用用户",
    adminLoadFailed: "后台数据加载失败。",
    adminDisableUser: "禁用",
    adminEnableUser: "启用",
    adminUserDisabled: "用户已禁用。",
    adminUserEnabled: "用户已启用。",
    adminUserActionFailed: "用户状态更新失败。",
    adminRecentConversations: "最近会话",
    adminMembers: "成员",
    adminMessageCount: "消息数",
    adminFeedbackQueue: "反馈处理",
    adminMarkInReview: "处理中",
    adminMarkResolved: "已解决",
    adminMarkDismissed: "关闭",
    adminFeedbackUpdated: "反馈状态已更新。",
    adminFeedbackUpdateFailed: "反馈状态更新失败。",
    adminResetPassword: "重置密码",
    adminTempPassword: "临时密码",
    adminPasswordResetDone: "临时密码已生成。",
    adminPasswordResetFailed: "密码重置失败。",
    adminViewChats: "聊天信息",
    adminUserDetails: "用户资料",
    adminUserChats: "用户聊天信息",
    adminChatMessages: "聊天消息",
    adminNoMessages: "暂无消息",
    adminLoadUserChatsFailed: "用户聊天信息加载失败。",
    friendRequestsTitle: "联系人请求",
    friendsTitle: "联系人",
    acceptFriend: "接受",
    rejectFriend: "拒绝",
    friendRequestSent: "已打开聊天。",
    friendRequestAccepted: "已接受联系人请求。",
    friendRequestRejected: "已拒绝联系人请求。",
    blockUser: "拉黑",
    unblockUser: "取消拉黑",
    blockedUsersTitle: "已拉黑用户",
    userBlocked: "用户已拉黑。",
    userUnblocked: "已取消拉黑。",
    removeFriend: "删除联系人",
    copyShortcut: "复制快捷链接",
    shortcutCopied: "快捷链接已复制。",
    shortcutUnavailable: "请先打开一次聊天，再复制快捷链接。",
    friendRemoved: "联系人已删除。",
    friendRequestFailed: "联系人操作失败，请稍后重试。",
    addFriend: "保存联系人",
    openChat: "打开聊天",
    contactSaved: "联系人已保存。",
    profile: "当前用户可在多个浏览器窗口实时聊天。",
    empty: "没有匹配结果",
    connected: "实时服务已连接",
    disconnected: "实时服务未连接，请确认 API 已启动。",
    sent: "消息已通过 WebSocket 发出。",
    noConversations: "暂无会话。请在联系人中搜索用户并开始聊天。",
    contactHint: "按邮箱或昵称搜索，然后开始一对一聊天。",
    searching: "搜索中...",
    english: "英文",
    chinese: "中文",
    loadingOlder: "加载中...",
    loadOlder: "加载更早消息",
    requestFailed: "请求失败，请稍后重试。",
    searchFailed: "搜索失败，请稍后重试。",
    startConversationFailed: "无法开始会话，请稍后重试。",
    readStateFailed: "无法更新已读状态，请稍后重试。",
    olderMessagesFailed: "无法加载更早消息，请稍后重试。",
    authFailed: "认证失败，请检查账号和密码。",
    sessionExpired: "登录已过期，请重新登录。",
    newConversation: "新会话",
    loadingConversations: "正在加载会话...",
    conversationsFailed: "会话加载失败。",
    emptyConversation: "暂无消息，发送第一条消息开始聊天。",
    loadingMessages: "正在加载消息...",
    messagesFailed: "消息加载失败。",
    noMoreMessages: "没有更早的消息了。",
    createGroup: "创建群聊",
    groupTitle: "群聊名称",
    groupMembers: "选择群成员",
    groupCreateFailed: "群聊创建失败，请稍后重试。",
    groupCreateHint: "至少选择 2 个已互通消息的联系人，加上你自己组成群聊。",
    groupNeedTwoFriends: "创建群聊至少需要 2 个已互通消息的联系人。",
    groupCreated: "群聊已创建。",
    groupNoFriends: "暂无可邀请联系人。",
    groupDetailsTitle: "群聊详情",
    groupManage: "群管理",
    groupMembersList: "群成员",
    groupInviteMembers: "添加成员",
    groupInviteHint: "群内所有人都可以邀请已互通消息的联系人进群。",
    groupInviteSuccess: "成员已加入群聊。",
    groupInviteFailed: "添加成员失败。",
    groupInvitedBy: "邀请人",
    groupOwner: "群主",
    groupAnnouncement: "群公告",
    groupAnnouncementScroll: "群公告滚动显示",
    groupAvatar: "群头像",
    groupSaveSettings: "保存群设置",
    groupSettingsSaved: "群设置已保存。",
    groupDissolve: "解散群聊",
    groupDissolveConfirm: "确定要解散这个群聊吗？该操作不可恢复。",
    groupDissolved: "群聊已解散。",
    groupNoInviteCandidates: "暂无可添加联系人。"
  },
  en: {
    subtitle: "CN/EN translation · Web/PWA",
    search: "Search by email, phone, or nickname",
    chats: "Chats",
    contacts: "Contacts",
    me: "Me",
    auto: "Server translation enabled; verify language coverage and fallback before public testing",
    details: "Details",
    input: "Type a message...",
    attach: "Send image, video, audio, or file",
    uploadingMedia: "Uploading media...",
    mediaUnsupported: "This file is not supported. Please try another file.",
    mediaTooLarge: "The selected file exceeds the allowed size limit.",
    mediaUploadFailed: "Media upload failed. Please try again.",
    mediaOpen: "Open preview",
    mediaClose: "Close preview",
    pdfPreview: "Preview PDF",
    rotateLeft: "Rotate left",
    rotateRight: "Rotate right",
    videoFitAuto: "Auto",
    videoFitPortrait: "Portrait right",
    videoFitPortraitAlt: "Portrait left",
    videoFitLandscape: "Landscape",
    uploadRetry: "Retry upload",
    uploadCancel: "Cancel upload",
    mediaVideoTooLong: "Video must be 5 minutes or shorter.",
    mediaFiles: "Chat files",
    mediaAll: "All",
    mediaImages: "Images",
    mediaVideos: "Videos",
    mediaAudios: "Audio",
    mediaDocs: "Files",
    mediaEmpty: "No files in this category yet.",
    mediaLoadOlder: "Load older messages",
    mediaLocate: "Show in chat",
    pinConversation: "Pin chat",
    unpinConversation: "Unpin chat",
    deleteChat: "Delete chat",
    chatDeleted: "Chat removed from the list.",
    chatPinned: "Chat pinned.",
    chatUnpinned: "Chat unpinned.",
    voiceRecordStart: "Voice",
    voiceRecordStop: "Send voice",
    voiceRecording: "Recording...",
    voiceRecordFailed: "Voice recording failed. Check microphone permission.",
    voiceTranscript: "Transcribe",
    voiceTranscriptEmpty: "No transcript is available for this voice message.",
    voiceTranscriptHide: "Hide text",
    voicePreviewReady: "Voice is ready. Listen before sending.",
    voiceSendConfirm: "Send",
    voiceCancel: "Cancel",
    messageRevoked: "Message recalled",
    revokeMessage: "Recall",
    revokeFailed: "Recall failed or the time limit has passed.",
    downloadOriginal: "Download original",    settings: "Settings",
    translationTarget: "Translation language",
    displayMode: "Message display",
    speechAccent: "Reading accent",
    speechAccentAuto: "Follow message language",
    originalOnly: "Original",
    translatedOnly: "Translation",
    bilingual: "Bilingual",
    notifications: "New message alerts",
    notificationsHint: "Show a system notification when the chat is not open.",
    notificationSound: "Sound",
    notificationVibration: "Phone vibration",
    notificationPermission: "Allow browser notification permission when prompted.",
    changePasswordTitle: "Change password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    profileSettingsTitle: "Profile settings",
    showSenderNames: "Show sender names in chat",
    profileNickname: "Nickname",
    profileCompany: "Company",
    profileTitle: "Title",
    profileLocation: "Location",
    profileBio: "Bio",
    profileSignature: "Signature",
    profileEmail: "Email",
    profilePhone: "Phone",
    profilePublicId: "ID",
    profilePublic: "Make profile public",
    profileEmailPublic: "Show email publicly",
    profilePhonePublic: "Show phone publicly",
    profileIdHint: "ID can be used to find you. Use 3-32 letters, numbers, dots, underscores, or hyphens. It can be changed once every 6 months.",
    profileRole: "Role",
    profileLanguage: "Interface language",
    profileAvatar: "Avatar",
    uploadAvatar: "Upload avatar",
    cropAvatarTitle: "Crop avatar",
    cropAvatarConfirm: "Use avatar",
    cropAvatarCancel: "Cancel",
    cropAvatarZoom: "Zoom",
    saveProfile: "Save",
    editProfile: "Edit",
    editSignature: "Edit",
    saveSignature: "Save",
    registeredInfo: "Registered info",
    profileSaved: "Profile saved.",
    profileSaveFailed: "Could not save profile.",
    viewContactDetails: "Details",
    contactDetailsTitle: "Contact details",
    contactDetailsEmpty: "This contact has not added public profile information yet.",
    updatePassword: "Update password",
    passwordUpdated: "Password updated.",
    passwordMismatch: "New passwords do not match.",
    passwordTooShort: "New password must be at least 8 characters.",
    passwordChangeFailed: "Could not change password. Check the current password.",
    feedbackTitle: "Feedback",
    feedbackHint: "Tell us what went wrong or what you need next.",
    feedbackPlaceholder: "Describe your feedback...",
    feedbackSend: "Send feedback",
    feedbackSending: "Sending...",
    feedbackSent: "Feedback sent.",
    feedbackTooShort: "Feedback must be at least 5 characters.",
    feedbackFailed: "Could not send feedback. Please try again.",
    feedbackAttach: "Attach issue screenshot",
    feedbackAttachmentReady: "Screenshot attached.",
    feedbackAttachmentRemove: "Remove screenshot",
    versionLabel: "Version",
    adminDashboard: "Admin dashboard",
    adminLoad: "Open admin dashboard",
    adminClose: "Close",
    adminSearchUsers: "Search users",
    adminSearchFeedback: "Search feedback",
    adminSearchConversations: "Search conversations",
    adminNoResults: "No matching results",
    adminUsers: "Users",
    adminConversations: "Conversations",
    adminMessages: "Messages",
    adminOpenFeedback: "Open feedback",
    adminDisabledUsers: "Disabled users",
    adminLoadFailed: "Could not load admin data.",
    adminDisableUser: "Disable",
    adminEnableUser: "Enable",
    adminUserDisabled: "User disabled.",
    adminUserEnabled: "User enabled.",
    adminUserActionFailed: "Could not update user status.",
    adminRecentConversations: "Recent conversations",
    adminMembers: "Members",
    adminMessageCount: "Messages",
    adminFeedbackQueue: "Feedback queue",
    adminMarkInReview: "In review",
    adminMarkResolved: "Resolved",
    adminMarkDismissed: "Dismiss",
    adminFeedbackUpdated: "Feedback status updated.",
    adminFeedbackUpdateFailed: "Could not update feedback status.",
    adminResetPassword: "Reset password",
    adminTempPassword: "Temporary password",
    adminPasswordResetDone: "Temporary password generated.",
    adminPasswordResetFailed: "Could not reset password.",
    adminViewChats: "Chats",
    adminUserDetails: "User details",
    adminUserChats: "User chat history",
    adminChatMessages: "Messages",
    adminNoMessages: "No messages yet",
    adminLoadUserChatsFailed: "Could not load user chat history.",
    friendRequestsTitle: "Contact requests",
    friendsTitle: "Contacts",
    acceptFriend: "Accept",
    rejectFriend: "Reject",
    friendRequestSent: "Chat opened.",
    friendRequestAccepted: "Contact request accepted.",
    friendRequestRejected: "Contact request rejected.",
    blockUser: "Block",
    unblockUser: "Unblock",
    blockedUsersTitle: "Blocked users",
    userBlocked: "User blocked.",
    userUnblocked: "User unblocked.",
    removeFriend: "Remove contact",
    copyShortcut: "Copy shortcut link",
    shortcutCopied: "Shortcut link copied.",
    shortcutUnavailable: "Open the chat once before copying a shortcut link.",
    friendRemoved: "Contact removed.",
    friendRequestFailed: "Could not update contacts. Please try again.",
    addFriend: "Save contact",
    openChat: "Open chat",
    contactSaved: "Contact saved.",
    profile: "Current user can chat in real time across browser windows.",
    empty: "No matches",
    connected: "Realtime service connected",
    disconnected: "Realtime service disconnected. Check that the API is running.",
    sent: "Message sent through WebSocket.",
    noConversations: "No conversations yet. Search a user in Contacts to start.",
    contactHint: "Search by email or nickname, then start a direct chat.",
    searching: "Searching...",
    english: "English",
    chinese: "Chinese",
    loadingOlder: "Loading...",
    loadOlder: "Load older messages",
    requestFailed: "Request failed. Please try again.",
    searchFailed: "Search failed. Please try again.",
    startConversationFailed: "Could not start the conversation. Please try again.",
    readStateFailed: "Could not update the read state. Please try again.",
    olderMessagesFailed: "Could not load older messages. Please try again.",
    authFailed: "Authentication failed. Check your account and password.",
    sessionExpired: "Your session expired. Please sign in again.",
    newConversation: "New conversation",
    loadingConversations: "Loading conversations...",
    conversationsFailed: "Could not load conversations.",
    emptyConversation: "No messages yet. Send the first message to start.",
    loadingMessages: "Loading messages...",
    messagesFailed: "Could not load messages.",
    noMoreMessages: "No earlier messages.",
    createGroup: "New group",
    groupTitle: "Group name",
    groupMembers: "Select members",
    groupCreateFailed: "Could not create the group. Please try again.",
    groupCreateHint: "Select at least 2 contacts who have exchanged direct messages. You will be included automatically.",
    groupNeedTwoFriends: "Creating a group needs at least 2 contacts who have exchanged direct messages.",
    groupCreated: "Group created.",
    groupNoFriends: "No contacts available to invite.",
    groupDetailsTitle: "Group details",
    groupManage: "Group info",
    groupMembersList: "Members",
    groupInviteMembers: "Add members",
    groupInviteHint: "Any group member can invite contacts who have exchanged direct messages.",
    groupInviteSuccess: "Members added to the group.",
    groupInviteFailed: "Could not add members.",
    groupInvitedBy: "Invited by",
    groupOwner: "Owner",
    groupAnnouncement: "Announcement",
    groupAnnouncementScroll: "Scroll group announcement",
    groupAvatar: "Group avatar",
    groupSaveSettings: "Save group settings",
    groupSettingsSaved: "Group settings saved.",
    groupDissolve: "Dissolve group",
    groupDissolveConfirm: "Dissolve this group? This cannot be undone.",
    groupDissolved: "Group dissolved.",
    groupNoInviteCandidates: "No contacts available to add."
  }
};

const connectionStatusLabels: Record<UiLanguage, Record<ConnectionState, string>> = {
  zh: {
    connected: "实时服务已连接",
    reconnecting: "正在恢复实时连接...",
    offline: "网络已断开，恢复网络后会自动重连。"
  },
  en: {
    connected: "Realtime service connected",
    reconnecting: "Reconnecting to realtime service...",
    offline: "You are offline. Reconnection will start when the network returns."
  }
};
const callLabels = {
  zh: {
    audioCall: "语音通话",
    videoCall: "视频通话",
    incomingAudio: "语音来电",
    incomingVideo: "视频来电",
    accept: "接听",
    reject: "拒绝",
    end: "挂断",
    mute: "静音",
    unmute: "取消静音",
    cameraOff: "关闭摄像头",
    cameraOn: "打开摄像头",
    calling: "正在呼叫...",
    connecting: "正在连接...",
    inCall: "通话中",
    localUser: "我",
    noRemote: "等待对方加入",
    permissionFailed: "无法打开麦克风或摄像头，请检查浏览器权限。",
    notSupported: "此浏览器不支持语音/视频通话。",
    callEnded: "通话已结束。",
    callRejected: "对方已拒绝通话。",
    callBusy: "对方正在通话中。"
  },
  en: {
    audioCall: "Voice call",
    videoCall: "Video call",
    incomingAudio: "Incoming voice call",
    incomingVideo: "Incoming video call",
    accept: "Accept",
    reject: "Decline",
    end: "End",
    mute: "Mute",
    unmute: "Unmute",
    cameraOff: "Camera off",
    cameraOn: "Camera on",
    calling: "Calling...",
    connecting: "Connecting...",
    inCall: "In call",
    localUser: "Me",
    noRemote: "Waiting for others to join",
    permissionFailed: "Could not open microphone or camera. Check browser permissions.",
    notSupported: "This browser does not support voice/video calls.",
    callEnded: "Call ended.",
    callRejected: "The call was declined.",
    callBusy: "The other side is already in a call."
  }
} as const;
const messageStatusLabels: Record<UiLanguage, Record<MessageSendStatus, string>> = {
  zh: {
    sending: "发送中",
    sent: "已发送",
    delivered: "已送达",
    read: "已读",
    failed: "发送失败"
  },
  en: {
    sending: "Sending",
    sent: "Sent",
    delivered: "Delivered",
    read: "Read",
    failed: "Failed"
  }
};
const messageActionLabels: Record<UiLanguage, { retry: string; reply: string; copy: string; copied: string; copyFailed: string; translate: string; translating: string; translated: string; translateFailed: string; translationUnavailable: string; retryTranslation: string; translationThrottled: string; readOriginal: string; readTranslation: string; speechUnavailable: string; revokeBatch: string; revokeBatchDone: string; remind: string; reminderSet: string; reminderDue: string }> = {
  zh: { retry: "重发", reply: "回复", copy: "复制", copied: "已复制", copyFailed: "复制失败", translate: "翻译/刷新翻译", translating: "翻译中", translated: "翻译已更新", translateFailed: "翻译失败，请稍后重试", translationUnavailable: "翻译失败，已显示原文。", retryTranslation: "重试翻译", translationThrottled: "翻译请求太频繁，请稍后再试。", readOriginal: "朗读原文", readTranslation: "朗读译文", speechUnavailable: "当前浏览器不支持朗读。", revokeBatch: "撤回本次发送", revokeBatchDone: "本次发送已撤回", remind: "设置提醒", reminderSet: "提醒已设置", reminderDue: "消息提醒" },
  en: { retry: "Retry", reply: "Reply", copy: "Copy", copied: "Copied", copyFailed: "Copy failed", translate: "Translate / refresh", translating: "Translating", translated: "Translation updated", translateFailed: "Translation failed. Please try again.", translationUnavailable: "Translation failed. Original text is shown.", retryTranslation: "Retry translation", translationThrottled: "Translation requests are too frequent. Please try again shortly.", readOriginal: "Read original", readTranslation: "Read translation", speechUnavailable: "This browser does not support text to speech.", revokeBatch: "Recall this send batch", revokeBatchDone: "Send batch recalled", remind: "Remind", reminderSet: "Reminder set", reminderDue: "Message reminder" }
};

function createBrowserId() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") {
    return browserCrypto.randomUUID();
  }
  if (typeof browserCrypto?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    browserCrypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalNetworkHost(hostname: string) {
  return (
    localHostnames.has(hostname) ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
  );
}

function isLocalNetworkUrl(value: string) {
  try {
    return isLocalNetworkHost(new URL(value).hostname);
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "");
}

function getConfiguredPublicUrl(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  if (trimmed === "same-origin") {
    if (typeof window === "undefined") return "";
    if (window.location.port === "3101") return `${window.location.protocol}//${window.location.hostname}:4100`;
    return window.location.origin;
  }
  const normalized = normalizeBaseUrl(trimmed);
  if (typeof window === "undefined") return normalized;
  if (isLocalNetworkHost(window.location.hostname)) return normalized;
  return isLocalNetworkUrl(normalized) ? "" : normalized;
}

function getApiUrl() {
  const configured = getConfiguredPublicUrl(process.env.NEXT_PUBLIC_API_URL);
  if (configured) return configured;
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  if (window.location.protocol === "https:" && window.location.port === "3443") return window.location.origin;
  if (localHostnames.has(window.location.hostname)) return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4100";
  return window.location.origin;
}
function normalizeMediaUrl(url: string | undefined) {
  if (!url || typeof window === "undefined") return url;
  try {
    const api = new URL(getApiUrl(), window.location.origin);
    const parsed = new URL(url, api);
    if (parsed.pathname.startsWith("/media/") && (url.startsWith("/") || isLocalNetworkHost(parsed.hostname))) {
      return `${api.origin}${parsed.pathname}${parsed.search}`;
    }
    if (isLocalNetworkHost(parsed.hostname) && parsed.port === api.port) {
      parsed.protocol = api.protocol;
      parsed.hostname = api.hostname;
      parsed.port = api.port;
      return parsed.toString();
    }
  } catch {
    return url;
  }
  return url;
}


function mediaUrlWithFileName(url: string | null | undefined, fileName?: string | null, forceDownload = false) {
  const normalized = normalizeMediaUrl(url ?? undefined) ?? url;
  if (!normalized || typeof window === "undefined") return normalized ?? "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    if (fileName) parsed.searchParams.set("name", fileName);
    if (forceDownload) parsed.searchParams.set("download", "1");
    return parsed.toString();
  } catch {
    return normalized;
  }
}

function mediaPreviewUrl(message: { mediaUrl?: string | null; body?: string | null }) {
  return mediaUrlWithFileName(message.mediaUrl, message.body, false);
}

function mediaThumbnailUrl(message: { mediaUrl?: string | null; thumbnailUrl?: string | null; body?: string | null }) {
  return message.thumbnailUrl ? mediaUrlWithFileName(message.thumbnailUrl, message.body, false) : mediaPreviewUrl(message);
}

function mediaDownloadUrl(message: { mediaUrl?: string | null; body?: string | null }) {
  return mediaUrlWithFileName(message.mediaUrl, message.body, true);
}

function isZipArchive(message: { mediaUrl?: string | null; body?: string | null }) {
  const name = ((message.body || message.mediaUrl || "").split("?")[0] ?? "").toLowerCase();
  return name.endsWith(".zip");
}

function isPdfFile(message: { mediaUrl?: string | null; body?: string | null }) {
  const name = ((message.body || message.mediaUrl || "").split("?")[0] ?? "").toLowerCase();
  return name.endsWith(".pdf");
}

function archivePreviewPath(message: { mediaUrl?: string | null; body?: string | null }) {
  const normalized = normalizeMediaUrl(message.mediaUrl ?? undefined) ?? message.mediaUrl;
  if (!normalized || typeof window === "undefined") return "";
  try {
    const parsed = new URL(normalized, window.location.origin);
    parsed.pathname = parsed.pathname.replace("/media/files/", "/media/archives/");
    if (message.body) parsed.searchParams.set("name", message.body);
    parsed.searchParams.delete("download");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "";
  }
}
function getStoredAuth() {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem("glimpse.auth");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthResponse;
  } catch {
    window.localStorage.removeItem("glimpse.auth");
    return null;
  }
}

function storeAuth(auth: AuthResponse) {
  window.localStorage.setItem("glimpse.auth", JSON.stringify(auth));
}

function avatarPreviewStorageKey(userId: string) {
  return `glimpse.avatarPreview.${userId}`;
}

function conversationPinsStorageKey(userId: string) {
  return `glimpse.conversationPins.${userId}`;
}

function messageRemindersStorageKey(userId: string) {
  return `glimpse.messageReminders.${userId}`;
}

function conversationHiddenStorageKey(userId: string) {
  return `glimpse.conversationHidden.${userId}`;
}

function hiddenContactsStorageKey(userId: string) {
  return `glimpse.hiddenContacts.${userId}`;
}

function readStoredIdSet(key: string) {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function writeStoredIdSet(key: string, values: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(Array.from(values)));
}

function getStoredAvatarPreview(userId: string) {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(avatarPreviewStorageKey(userId)) ?? "";
}

function storeAvatarPreview(userId: string, value: string) {
  if (typeof window === "undefined") return;
  if (value) window.localStorage.setItem(avatarPreviewStorageKey(userId), value);
  else window.localStorage.removeItem(avatarPreviewStorageKey(userId));
}


type AvatarCropOffset = { x: number; y: number };
type AvatarCropImageSize = { width: number; height: number };

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampAvatarCropOffset(offset: AvatarCropOffset, scale: number, imageSize: AvatarCropImageSize, viewportSize: number): AvatarCropOffset {
  if (!imageSize.width || !imageSize.height || !viewportSize) return { x: 0, y: 0 };
  const baseScale = Math.max(viewportSize / imageSize.width, viewportSize / imageSize.height);
  const renderedWidth = imageSize.width * baseScale * scale;
  const renderedHeight = imageSize.height * baseScale * scale;
  const maxX = Math.max(0, (renderedWidth - viewportSize) / 2);
  const maxY = Math.max(0, (renderedHeight - viewportSize) / 2);
  return {
    x: clampNumber(offset.x, -maxX, maxX),
    y: clampNumber(offset.y, -maxY, maxY)
  };
}

function distanceBetweenPoints(a: AvatarCropOffset, b: AvatarCropOffset) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpointBetweenPoints(a: AvatarCropOffset, b: AvatarCropOffset): AvatarCropOffset {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
function clearStoredAuth() {
  window.localStorage.removeItem("glimpse.auth");
}

function getSocketUrl() {
  const configured = getConfiguredPublicUrl(process.env.NEXT_PUBLIC_SOCKET_URL);
  if (configured) return configured;
  if (typeof window === "undefined") return process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4100";
  if (window.location.protocol === "https:" && window.location.port === "3443") return window.location.origin;
  if (localHostnames.has(window.location.hostname)) return process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4100";
  return window.location.origin;
}

function formatMessageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const time = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (startOfMessageDay === startOfToday) return time;
  const datePart = date.getFullYear() === now.getFullYear()
    ? new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date)
    : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  return `${datePart} ${time}`;
}

function formatConversationTime(value?: string) {
  if (!value) return "New";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New";

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86400000);

  if (dayDiff === 0) return new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (dayDiff === 1) return "Yesterday";
  if (date.getFullYear() === now.getFullYear()) return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function readFileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

function fileExtension(fileName: string) {
  return fileName.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

function mediaTypeFromFile(file: File): "image" | "video" | "audio" | "file" {
  const mimeType = file.type.toLowerCase();
  const extension = fileExtension(file.name);
  if (mimeType.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(extension)) return "image";
  if (mimeType.startsWith("video/") || [".mp4", ".mov", ".m4v", ".webm", ".mkv", ".3gp", ".3gpp", ".mpeg", ".mpg", ".mpe", ".rm", ".rmvb", ".avi", ".wmv", ".flv", ".f4v", ".ts", ".mts", ".m2ts", ".vob", ".ogv"].includes(extension)) return "video";
  if (mimeType.startsWith("audio/") || [".mp3", ".m4a", ".aac", ".wav", ".webm", ".ogg", ".flac"].includes(extension)) return "audio";
  return "file";
}

function uploadMimeTypeForFile(file: File) {
  if (file.type) return file.type;
  const extension = fileExtension(file.name);
  if ([".mp4", ".m4v"].includes(extension)) return "video/mp4";
  if ([".mpeg", ".mpg", ".mpe"].includes(extension)) return "video/mpeg";
  if ([".rm", ".rmvb"].includes(extension)) return "application/vnd.rn-realmedia";
  if (extension === ".avi") return "video/x-msvideo";
  if (extension === ".wmv") return "video/x-ms-wmv";
  if ([".flv", ".f4v"].includes(extension)) return "video/x-flv";
  if ([".ts", ".mts", ".m2ts"].includes(extension)) return "video/mp2t";
  if (extension === ".vob") return "video/dvd";
  if (extension === ".ogv") return "video/ogg";
  if (extension === ".mov") return "video/quicktime";
  if (extension === ".webm") return "video/webm";
  if ([".3gp", ".3gpp"].includes(extension)) return "video/3gpp";
  if (extension === ".mkv") return "video/x-matroska";
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".m4a") return "audio/mp4";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".ogg") return "audio/ogg";
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".txt") return "text/plain";
  return "application/octet-stream";
}
function createImageThumbnail(file: File) {
  return new Promise<File | null>((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const maxSide = 480;
      const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        URL.revokeObjectURL(url);
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          if (!blob) {
            resolve(null);
            return;
          }
          const stem = file.name.replace(/\.[^.]+$/, "") || "image";
          resolve(new File([blob], `${stem}-thumb.webp`, { type: "image/webp" }));
        },
        "image/webp",
        0.82
      );
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    image.src = url;
  });
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = video.duration;
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(duration) ? duration : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read video duration."));
    };
    video.src = url;
  });
}

function uploadMediaWithProgress(file: File, token: string, onProgress: (progress: number) => void) {
  return readFileAsBase64(file).then(
    (dataBase64) =>
      new Promise<UploadedMediaResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${getApiUrl()}/media/upload`);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          onProgress(Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))));
        };
        xhr.onload = () => {
          let data: unknown = {};
          try {
            data = JSON.parse(xhr.responseText || "{}");
          } catch {
            data = {};
          }
          if (xhr.status >= 200 && xhr.status < 300 && typeof data === "object" && data !== null && "media" in data) {
            onProgress(100);
            const media = (data as { media: UploadedMediaResponse }).media;
            resolve({ ...media, url: normalizeMediaUrl(media.url) ?? media.url });
            return;
          }
          reject(new Error(apiErrorMessage(data, "Media upload failed. Please try again.")));
        };
        xhr.onerror = () => reject(new Error("Media upload failed. Please try again."));
        xhr.send(JSON.stringify({ fileName: file.name, mimeType: uploadMimeTypeForFile(file), size: file.size, dataBase64 }));
      })
  );
}

function parseLocationMessage(body?: string): LocationMessagePayload | null {
  if (!body?.startsWith(LOCATION_MESSAGE_PREFIX)) return null;
  try {
    const parsed = JSON.parse(body.slice(LOCATION_MESSAGE_PREFIX.length)) as Partial<LocationMessagePayload>;
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
    return {
      latitude,
      longitude,
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 120) : undefined,
      address: typeof parsed.address === "string" ? parsed.address.slice(0, 240) : undefined
    };
  } catch {
    return null;
  }
}

function encodeLocationMessage(location: LocationMessagePayload) {
  return `${LOCATION_MESSAGE_PREFIX}${JSON.stringify(location)}`;
}

function locationMessageTitle(location: LocationMessagePayload) {
  return location.name?.trim() || location.address?.trim() || `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function locationMapUrl(location: LocationMessagePayload) {
  const lat = location.latitude.toFixed(6);
  const lng = location.longitude.toFixed(6);
  const label = encodeURIComponent(locationMessageTitle(location));
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}&layers=M`;
}

function mediaPreviewLabel(message: MessagePayload) {
  const location = message.type === "text" ? parseLocationMessage(message.body) : null;
  if (location) return `[Location] ${locationMessageTitle(location)}`;
  if (message.type === "image") return message.body ? `[Image] ${message.body}` : "[Image]";
  if (message.type === "video") return message.body ? `[Video] ${message.body}` : "[Video]";
  if (message.type === "audio") return message.body ? `[Audio] ${message.body}` : "[Audio]";
  if (message.type === "file") return message.body ? `[File] ${message.body}` : "[File]";
  return message.body ?? "";
}

function extractErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function localizeNoticeMessage(message: string, language: string) {
  if (language !== "zh") return message;
  const normalized = message.trim();
  if (!normalized) return message;
  const exact: Record<string, string> = {
    "Request failed. Please try again.": "\u8bf7\u6c42\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002",
    "Request timed out. Check the public API URL / ngrok tunnel and try again.": "\u8bf7\u6c42\u8d85\u65f6\uff0c\u8bf7\u68c0\u67e5\u516c\u7f51 API \u5730\u5740\u6216 ngrok \u901a\u9053\u540e\u91cd\u8bd5\u3002",
    "Invalid email or password.": "\u90ae\u7bb1\u6216\u5bc6\u7801\u9519\u8bef\u3002",
    "Invalid or expired token.": "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002",
    "Missing bearer token.": "\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u91cd\u65b0\u767b\u5f55\u3002",
    "Account is disabled.": "\u8d26\u6237\u5df2\u88ab\u7981\u7528\u3002",
    "Current password is incorrect.": "\u5f53\u524d\u5bc6\u7801\u4e0d\u6b63\u786e\u3002",
    "New password must be different from the current password.": "\u65b0\u5bc6\u7801\u4e0d\u80fd\u4e0e\u5f53\u524d\u5bc6\u7801\u76f8\u540c\u3002",
    "ID must be 3-32 characters and can only contain letters, numbers, dot, underscore, or hyphen.": "ID \u9700\u8981 3-32 \u4f4d\uff0c\u53ea\u80fd\u5305\u542b\u5b57\u6bcd\u3001\u6570\u5b57\u3001\u70b9\u3001\u4e0b\u5212\u7ebf\u6216\u77ed\u6a2a\u7ebf\u3002",
    "You must be friends before starting a direct conversation.": "\u9700\u8981\u5148\u4fdd\u5b58\u4e3a\u8054\u7cfb\u4eba\u624d\u80fd\u5f00\u59cb\u79c1\u804a\u3002",
    "This user is blocked.": "\u8be5\u7528\u6237\u5df2\u88ab\u62c9\u9ed1\u3002",
    "Cannot block yourself.": "\u4e0d\u80fd\u62c9\u9ed1\u81ea\u5df1\u3002",
    "User was not found.": "\u672a\u627e\u5230\u8be5\u7528\u6237\u3002",
    "Blocked user was not found.": "\u672a\u627e\u5230\u5df2\u62c9\u9ed1\u7528\u6237\u3002",
    "You are already friends.": "\u5df2\u7ecf\u662f\u8054\u7cfb\u4eba\u3002",
    "Friendship was not found.": "\u672a\u627e\u5230\u8054\u7cfb\u4eba\u5173\u7cfb\u3002",
    "Pending friend request was not found.": "\u672a\u627e\u5230\u5f85\u5904\u7406\u7684\u597d\u53cb\u8bf7\u6c42\u3002",
    "Message not found.": "\u672a\u627e\u5230\u8be5\u6d88\u606f\u3002",
    "Cannot send messages to a blocked user.": "\u65e0\u6cd5\u5411\u5df2\u62c9\u9ed1\u7528\u6237\u53d1\u9001\u6d88\u606f\u3002",
    "Group conversation was not found.": "\u672a\u627e\u5230\u8be5\u7fa4\u804a\u3002",
    "One or more group members were not found.": "\u4e00\u4e2a\u6216\u591a\u4e2a\u7fa4\u6210\u5458\u672a\u627e\u5230\u3002",
    "One or more invitees were not found.": "\u4e00\u4e2a\u6216\u591a\u4e2a\u88ab\u9080\u8bf7\u4eba\u672a\u627e\u5230\u3002",
    "This file type is not allowed.": "\u4e0d\u652f\u6301\u8be5\u6587\u4ef6\u7c7b\u578b\u3002",
    "Media file was not found.": "\u672a\u627e\u5230\u8be5\u5a92\u4f53\u6587\u4ef6\u3002",
    "Feedback was not found.": "\u672a\u627e\u5230\u8be5\u53cd\u9988\u3002",
    "You cannot reset your own password here.": "\u4e0d\u80fd\u5728\u8fd9\u91cc\u91cd\u7f6e\u81ea\u5df1\u7684\u5bc6\u7801\u3002",
    "You cannot disable your own account.": "\u4e0d\u80fd\u7981\u7528\u81ea\u5df1\u7684\u8d26\u6237\u3002",
    "Message forwarded.": "\u6d88\u606f\u5df2\u8f6c\u53d1\u3002"
  };
  if (exact[normalized]) return exact[normalized];
  if (/Public ID/i.test(normalized) && /already|taken|exists|unique/i.test(normalized)) return "ID \u5df2\u88ab\u4f7f\u7528\uff0c\u8bf7\u66f4\u6362\u540e\u91cd\u8bd5\u3002";
  if (/183|6 months|six months|change/i.test(normalized) && /ID/i.test(normalized)) return "ID \u534a\u5e74\u5185\u53ea\u80fd\u4fee\u6539\u4e00\u6b21\u3002";
  if (/failed/i.test(normalized)) return "\u64cd\u4f5c\u5931\u8d25\uff0c\u8bf7\u91cd\u8bd5\u3002";
  if (/not found/i.test(normalized)) return "\u672a\u627e\u5230\u76f8\u5173\u6570\u636e\u3002";
  if (/unauthorized|forbidden/i.test(normalized)) return "\u6ca1\u6709\u6743\u9650\u6216\u767b\u5f55\u5df2\u5931\u6548\u3002";
  return message;
}

function apiErrorMessage(data: unknown, fallback: string) {
  if (typeof data === "object" && data && "message" in data) {
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.map(String).join("; ");
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
function requestTimeoutMessage() {
  return "Request timed out. Check the public API URL / ngrok tunnel and try again.";
}

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(requestTimeoutMessage());
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}
function mapConversation(summary: ConversationSummary): Conversation {
  return {
    id: summary.id,
    name: summary.title,
    preview: summary.latestMessage ?? "Start a secure conversation.",
    time: formatConversationTime(summary.latestMessageAt),
    latestMessageAt: summary.latestMessageAt,
    unread: summary.unreadCount,
    avatarUrl: normalizeMediaUrl(summary.avatarUrl),
    announcement: summary.announcement ?? undefined,
    announcementScroll: summary.announcementScroll ?? true,
    ownerId: summary.ownerId ?? undefined,
    memberCount: summary.memberCount,
    otherUser: summary.otherUser ? { ...summary.otherUser, avatarUrl: normalizeMediaUrl(summary.otherUser.avatarUrl ?? summary.avatarUrl) } : undefined,
    online: summary.online ?? summary.otherUser?.online ?? false,
    type: summary.type === "group" ? "group" : "single",
    language: "en"
  };
}


function conversationSortTime(conversation: Conversation) {
  const value = conversation.latestMessageAt ? new Date(conversation.latestMessageAt).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function compareConversations(left: Conversation, right: Conversation, pinnedConversationIds: Set<string>) {
  const pinnedDelta = Number(pinnedConversationIds.has(right.id)) - Number(pinnedConversationIds.has(left.id));
  if (pinnedDelta !== 0) return pinnedDelta;
  return conversationSortTime(right) - conversationSortTime(left);
}

async function apiJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithTimeout(`${getApiUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(apiErrorMessage(data, "Request failed. Please try again."));
  }
  return data as T;
}

const speechAccentOptions: Array<{ code: SpeechAccent; label: string }> = [
  { code: "auto", label: "Auto / 跟随消息语言" },
  { code: "en-IN", label: "English - India" },
  { code: "en-US", label: "English - United States" },
  { code: "en-GB", label: "English - United Kingdom" },
  { code: "zh-CN", label: "中文普通话 - 中国大陆" },
  { code: "zh-TW", label: "中文普通话 - 台湾" },
  { code: "hi-IN", label: "Hindi - India" },
  { code: "ta-IN", label: "Tamil - India" },
  { code: "te-IN", label: "Telugu - India" },
  { code: "bn-IN", label: "Bengali - India" },
  { code: "ar-SA", label: "Arabic" },
  { code: "ur-PK", label: "Urdu" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" }
];
type AdminOverview = {
  users: number;
  disabledUsers: number;
  conversations: number;
  messages: number;
  openFeedback: number;
};

type AdminUserRow = {
  id: string;
  email?: string | null;
  phone?: string | null;
  publicId?: string | null;
  publicIdUpdatedAt?: string | null;
  profilePublic?: boolean | null;
  profileEmailPublic?: boolean | null;
  profilePhonePublic?: boolean | null;
  nickname: string;
  avatarUrl?: string | null;
  profileCompany?: string | null;
  profileTitle?: string | null;
  profileLocation?: string | null;
  profileBio?: string | null;
  profileSignature?: string | null;
  language: string;
  role: string;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};
type AdminConversationRow = {
  id: string;
  type: string;
  title?: string | null;
  ownerId?: string | null;
  memberCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  members: Array<{
    userId: string;
    nickname: string;
    email?: string | null;
    phone?: string | null;
    disabledAt?: string | null;
    joinedAt: string;
    lastReadAt?: string | null;
  }>;
};

type AdminUserChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  type: string;
  body?: string | null;
  mediaUrl?: string | null;
  mediaThumbnailUrl?: string | null;
  sourceLanguage?: string | null;
  createdAt: string;
  sender?: {
    id: string;
    nickname: string;
    email?: string | null;
    phone?: string | null;
    disabledAt?: string | null;
  } | null;
  translations: Array<{ language: string; body: string; createdAt: string }>;
};

type AdminUserChatConversation = AdminConversationRow & {
  messages: AdminUserChatMessage[];
};

type AdminUserChats = {
  user: AdminUserRow;
  conversations: AdminUserChatConversation[];
};
type AdminFeedbackRow = {
  id: string;
  userId: string;
  category: string;
  message: string;
  attachmentUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email?: string | null;
    phone?: string | null;
    nickname: string;
    disabledAt?: string | null;
  };
};
const speechLanguageByTranslationLanguage: Record<TranslationLanguage, string> = {
  zh: "zh-CN",
  en: "en-US",
  hi: "hi-IN",
  ar: "ar-SA",
  bn: "bn-IN",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  id: "id-ID",
  it: "it-IT",
  ja: "ja-JP",
  ko: "ko-KR",
  ms: "ms-MY",
  nl: "nl-NL",
  pt: "pt-PT",
  ru: "ru-RU",
  ta: "ta-IN",
  te: "te-IN",
  th: "th-TH",
  tr: "tr-TR",
  ur: "ur-PK",
  vi: "vi-VN"
};

const targetLanguageScriptPatterns: Partial<Record<TranslationLanguage, RegExp>> = {
  zh: /[\u3400-\u9fff]/,
  hi: /[\u0900-\u097f]/,
  ar: /[\u0600-\u06ff]/,
  ur: /[\u0600-\u06ff]/,
  bn: /[\u0980-\u09ff]/,
  ja: /[\u3040-\u30ff]/,
  ko: /[\uac00-\ud7af]/,
  ru: /[\u0400-\u04ff]/,
  ta: /[\u0b80-\u0bff]/,
  te: /[\u0c00-\u0c7f]/,
  th: /[\u0e00-\u0e7f]/
};

function appearsToAlreadyBeTargetLanguage(text: string | undefined, targetLanguage: TranslationLanguage) {
  if (!text) return false;
  const pattern = targetLanguageScriptPatterns[targetLanguage];
  return pattern ? pattern.test(text) : false;
}

function inferSpeechLanguage(text: string | undefined, fallback: TranslationLanguage) {
  if (!text) return speechLanguageByTranslationLanguage[fallback];
  if (/[\u3400-\u9fff]/.test(text)) return speechLanguageByTranslationLanguage.zh;
  if (/[\u0900-\u097f]/.test(text)) return speechLanguageByTranslationLanguage.hi;
  if (/[\u0980-\u09ff]/.test(text)) return speechLanguageByTranslationLanguage.bn;
  if (/[\u0b80-\u0bff]/.test(text)) return speechLanguageByTranslationLanguage.ta;
  if (/[\u0c00-\u0c7f]/.test(text)) return speechLanguageByTranslationLanguage.te;
  if (/[\u0600-\u06ff]/.test(text)) return speechLanguageByTranslationLanguage.ur;
  if (/[\u3040-\u30ff]/.test(text)) return speechLanguageByTranslationLanguage.ja;
  if (/[\uac00-\ud7af]/.test(text)) return speechLanguageByTranslationLanguage.ko;
  if (/[\u0400-\u04ff]/.test(text)) return speechLanguageByTranslationLanguage.ru;
  if (/[\u0e00-\u0e7f]/.test(text)) return speechLanguageByTranslationLanguage.th;
  if (/[A-Za-z]/.test(text)) return speechLanguageByTranslationLanguage.en;
  return speechLanguageByTranslationLanguage[fallback];
}
function translationRequestKey(message: MessagePayload, targetLanguage: TranslationLanguage) {
  return `${message.id}:${targetLanguage}`;
}
function mergeMessageStatus(current: MessageSendStatus | undefined, next: MessageSendStatus) {
  if (!current || current === "failed") return next;
  const rank: Record<MessageSendStatus, number> = { sending: 0, sent: 1, delivered: 2, read: 3, failed: -1 };
  return rank[next] > rank[current] ? next : current;
}

function mergeMessages(current: MessagePayload[], incoming: MessagePayload[]) {
  const byId = new Map<string, MessagePayload>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function ChatPrototype() {
  const [tab, setTab] = useState<Tab>("chats");
  const [mobilePane, setMobilePane] = useState<MobilePane>("list");
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>("en");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [translationTargetLanguage, setTranslationTargetLanguage] = useState<TranslationLanguage>(() => {
    if (typeof window === "undefined") return "zh";
    const stored = window.localStorage.getItem("glimpse.translationTargetLanguage");
    return TRANSLATION_LANGUAGE_OPTIONS.some((item) => item.code === stored) ? (stored as TranslationLanguage) : "zh";
  });
  const [messageDisplayMode, setMessageDisplayMode] = useState<MessageDisplayMode>(() => {
    if (typeof window === "undefined") return "bilingual";
    const stored = window.localStorage.getItem("glimpse.messageDisplayMode");
    return stored === "original" || stored === "translated" || stored === "bilingual" ? stored : "bilingual";
  });
  const [showSenderNames, setShowSenderNames] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.showSenderNames") !== "false";
  });
  const [speechAccent, setSpeechAccent] = useState<SpeechAccent>(() => {
    if (typeof window === "undefined") return "auto";
    const stored = window.localStorage.getItem("glimpse.speechAccent");
    return speechAccentOptions.some((item) => item.code === stored) ? (stored as SpeechAccent) : "auto";
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.notificationsEnabled") !== "false";
  });
  const [notificationSoundEnabled, setNotificationSoundEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("glimpse.notificationSoundEnabled") === "true";
  });
  const [notificationVibrationEnabled, setNotificationVibrationEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("glimpse.notificationVibrationEnabled") !== "false";
  });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(defaultConversation.id);
  const [pendingShortcutConversationId, setPendingShortcutConversationId] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("conversation") ?? "";
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, MessagePayload[]>>({});
  const [messageStatuses, setMessageStatuses] = useState<Record<string, MessageSendStatus>>({});
  const [highlightedMessageIds, setHighlightedMessageIds] = useState<Record<string, boolean>>({});
  const [speakingMessageKey, setSpeakingMessageKey] = useState<string>("");
  const [translationLoading, setTranslationLoading] = useState<Record<string, boolean>>({});
  const [translationErrors, setTranslationErrors] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState("");
  const [mediaUploading, setMediaUploading] = useState(false);
  const [mediaUploadProgress, setMediaUploadProgress] = useState(0);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [locationName, setLocationName] = useState("");
  const [locationLatitude, setLocationLatitude] = useState("");
  const [locationLongitude, setLocationLongitude] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceTranscriptDraft, setVoiceTranscriptDraft] = useState("");
  const [visibleTranscriptIds, setVisibleTranscriptIds] = useState<Set<string>>(() => new Set());
  const [pendingVoicePreview, setPendingVoicePreview] = useState<PendingVoicePreview | null>(null);
  const [failedMediaFile, setFailedMediaFile] = useState<File | null>(null);
  const [previewMedia, setPreviewMedia] = useState<MediaPreview | null>(null);
  const [previewRotation, setPreviewRotation] = useState(0);
  const [previewVideoFit, setPreviewVideoFit] = useState<VideoFitMode>("auto");
  const [previewVideoSize, setPreviewVideoSize] = useState<{ width: number; height: number } | null>(null);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [composerMenuOpen, setComposerMenuOpen] = useState(false);
  const [mediaLibraryView, setMediaLibraryView] = useState<"history" | "files">("history");
  const [mediaLibraryFilter, setMediaLibraryFilter] = useState<MediaLibraryFilter>("all");
  const [archivePreview, setArchivePreview] = useState<ArchivePreviewState | null>(null);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageReminders, setMessageReminders] = useState<MessageReminder[]>([]);
  const [messageSelectMode, setMessageSelectMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(() => new Set());
  const [forwardMessages, setForwardMessages] = useState<MessagePayload[]>([]);
  const [messageSearchType, setMessageSearchType] = useState<MessageSearchType>("all");
  const [messageSearchDate, setMessageSearchDate] = useState("");
  const [conversationMenu, setConversationMenu] = useState<{ conversationId: string; x: number; y: number } | null>(null);
  const [pinnedConversationIds, setPinnedConversationIds] = useState<Set<string>>(() => new Set());
  const [hiddenConversationIds, setHiddenConversationIds] = useState<Set<string>>(() => new Set());
  const [hiddenContactUserIds, setHiddenContactUserIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>("reconnecting");
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());
  const [accessToken, setAccessToken] = useState("");
  const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNickname, setAuthNickname] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [authCodeSent, setAuthCodeSent] = useState(false);
  const [authCodeSending, setAuthCodeSending] = useState(false);
  const [authCodeCountdown, setAuthCodeCountdown] = useState(0);
  const [changePasswordCurrent, setChangePasswordCurrent] = useState("");
  const [changePasswordNew, setChangePasswordNew] = useState("");
  const [changePasswordConfirm, setChangePasswordConfirm] = useState("");
  const [changePasswordSaving, setChangePasswordSaving] = useState(false);
  const [profilePublicId, setProfilePublicId] = useState("");
  const [profileIsPublic, setProfileIsPublic] = useState(true);
  const [profileEmailPublic, setProfileEmailPublic] = useState(false);
  const [profilePhonePublic, setProfilePhonePublic] = useState(false);
  const [profileNicknameValue, setProfileNicknameValue] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileAvatarPreviewUrl, setProfileAvatarPreviewUrl] = useState("");
  const [profileCompany, setProfileCompany] = useState("");
  const [profileTitle, setProfileTitle] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileSignature, setProfileSignature] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileSignatureEditing, setProfileSignatureEditing] = useState(false);
  const [profileSignatureSaving, setProfileSignatureSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const [avatarCropSource, setAvatarCropSource] = useState("");
  const [avatarCropTarget, setAvatarCropTarget] = useState<"profile" | "group">("profile");
  const [avatarCropScale, setAvatarCropScale] = useState(1);
  const [avatarCropOffset, setAvatarCropOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [avatarCropImageSize, setAvatarCropImageSize] = useState<AvatarCropImageSize>({ width: 0, height: 0 });
  const [avatarCropFrameSize, setAvatarCropFrameSize] = useState(320);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackAttachment, setFeedbackAttachment] = useState<UploadedMediaResponse | null>(null);
  const [feedbackAttachmentUploading, setFeedbackAttachmentUploading] = useState(false);
  const [feedbackAttachmentProgress, setFeedbackAttachmentProgress] = useState(0);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState<ReplyDraft | null>(null);
  const [adminOverview, setAdminOverview] = useState<AdminOverview | null>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUserRow[]>([]);
  const [adminConversations, setAdminConversations] = useState<AdminConversationRow[]>([]);
  const [adminFeedback, setAdminFeedback] = useState<AdminFeedbackRow[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [adminActionUserId, setAdminActionUserId] = useState("");
  const [adminPasswordReset, setAdminPasswordReset] = useState<{ user: AdminUserRow; temporaryPassword: string } | null>(null);
  const [adminFeedbackActionId, setAdminFeedbackActionId] = useState("");
  const [adminUserChatsLoadingId, setAdminUserChatsLoadingId] = useState("");
  const [adminSelectedUserChats, setAdminSelectedUserChats] = useState<AdminUserChats | null>(null);
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [adminFeedbackQuery, setAdminFeedbackQuery] = useState("");
  const [adminConversationQuery, setAdminConversationQuery] = useState("");
  const filteredAdminUsers = useMemo(() => {
    const keyword = adminUserQuery.trim().toLowerCase();
    if (!keyword) return adminUsers;
    return adminUsers.filter((user) => [user.nickname, user.email, user.phone, user.id, user.role, user.language, user.disabledAt ? "disabled" : "active"].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminUserQuery, adminUsers]);

  const filteredAdminFeedback = useMemo(() => {
    const keyword = adminFeedbackQuery.trim().toLowerCase();
    if (!keyword) return adminFeedback;
    return adminFeedback.filter((feedback) => [feedback.id, feedback.category, feedback.status, feedback.message, feedback.attachmentUrl, feedback.user.nickname, feedback.user.email, feedback.user.phone, feedback.userId].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminFeedbackQuery, adminFeedback]);

  const filteredAdminConversations = useMemo(() => {
    const keyword = adminConversationQuery.trim().toLowerCase();
    if (!keyword) return adminConversations;
    return adminConversations.filter((conversation) => [conversation.id, conversation.type, conversation.title, conversation.ownerId, conversation.memberCount, conversation.messageCount, conversation.members.map((member) => `${member.nickname} ${member.email ?? ""} ${member.phone ?? ""} ${member.userId}`).join(" ")].some((value) => String(value ?? "").toLowerCase().includes(keyword)));
  }, [adminConversationQuery, adminConversations]);
  const [contactResults, setContactResults] = useState<SearchUser[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestView[]>([]);
  const [friends, setFriends] = useState<SearchUser[]>([]);
  const [contactDetailsUser, setContactDetailsUser] = useState<SearchUser | null>(null);
  const [removeContactClearHistory, setRemoveContactClearHistory] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupTitleValue, setGroupTitleValue] = useState("");
  const [groupSelectedIds, setGroupSelectedIds] = useState<string[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);
  const [groupError, setGroupError] = useState("");
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);
  const [groupDetailsConversation, setGroupDetailsConversation] = useState<Conversation | null>(null);
  const [groupMembers, setGroupMembers] = useState<GroupMemberSummary[]>([]);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupInviteSelectedIds, setGroupInviteSelectedIds] = useState<string[]>([]);
  const [groupInviteSaving, setGroupInviteSaving] = useState(false);
  const [groupTitleEditValue, setGroupTitleEditValue] = useState("");
  const [groupAnnouncementValue, setGroupAnnouncementValue] = useState("");
  const [groupAnnouncementScrollValue, setGroupAnnouncementScrollValue] = useState(true);
  const [groupAnnouncementDismissedForId, setGroupAnnouncementDismissedForId] = useState<string | null>(null);
  const [groupAvatarUploading, setGroupAvatarUploading] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserView[]>([]);
  const [friendDataLoading, setFriendDataLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsFailed, setConversationsFailed] = useState(false);
  const onlineUserIdsRef = useRef<Set<string>>(new Set());
  const [messageLoadStates, setMessageLoadStates] = useState<Record<string, MessageLoadState>>({});
  const [historyEndReached, setHistoryEndReached] = useState<Record<string, boolean>>({});
  const [historyCursors, setHistoryCursors] = useState<Record<string, string | undefined>>({});
  const socketRef = useRef<Socket | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const voiceRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<BlobPart[]>([]);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptDraftRef = useRef("");
  const groupAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const feedbackFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarCropFrameRef = useRef<HTMLDivElement | null>(null);
  const avatarCropGestureRef = useRef<{ pointers: Map<number, AvatarCropOffset>; lastCenter: AvatarCropOffset | null; lastDistance: number | null; }>({ pointers: new Map(), lastCenter: null, lastDistance: null });
  const pendingScrollToBottomRef = useRef(false);
  const pendingScrollBehaviorRef = useRef<ScrollBehavior>("smooth");
  const selectedIdRef = useRef(selectedId);
  const mobilePaneRef = useRef(mobilePane);
  const tabRef = useRef(tab);
  const pendingQuoteJumpRef = useRef<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!profileNotice) return;
    const timer = window.setTimeout(() => setProfileNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [profileNotice]);
  useEffect(() => {
    setPreviewRotation(0);
    setPreviewVideoFit("auto");
    setPreviewVideoSize(null);
  }, [previewMedia?.url]);
  const currentUserIdRef = useRef<string | null>(null);
  const accessTokenRef = useRef(accessToken);
  const messagesByConversationRef = useRef(messagesByConversation);
  const conversationsRef = useRef(conversations);
  const messageStatusesRef = useRef(messageStatuses);
  const translationTargetLanguageRef = useRef(translationTargetLanguage);
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const notificationSoundEnabledRef = useRef(notificationSoundEnabled);
  const notificationVibrationEnabledRef = useRef(notificationVibrationEnabled);
  const autoTranslationRequestsRef = useRef(new Set<string>());
  const autoTranslationQueueRef = useRef<PendingAutoTranslation[]>([]);
  const autoTranslationActiveRef = useRef(0);
  const autoTranslationTimerRef = useRef<number | null>(null);
  const manualTranslationCooldownRef = useRef<Record<string, number>>({});
  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localCallStreamRef = useRef<MediaStream | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const callWakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localCallStream, setLocalCallStream] = useState<MediaStream | null>(null);
  const [remoteCallStreams, setRemoteCallStreams] = useState<RemoteCallStream[]>([]);
  const [remoteCameraOffByUserId, setRemoteCameraOffByUserId] = useState<Record<string, boolean>>({});
  const [callError, setCallError] = useState("");
  const [callExpanded, setCallExpanded] = useState(false);
  const [focusedCallTileId, setFocusedCallTileId] = useState<string | null>(null);
  const [callPipPosition, setCallPipPosition] = useState({ x: 16, y: 88 });
  const [callPipSize, setCallPipSize] = useState({ width: 96, height: 171 });
  const [cameraFacing, setCameraFacing] = useState<CameraFacingMode>("user");
  const cameraFacingRef = useRef<CameraFacingMode>("user");
  const callPipDragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);
  const callPipResizeRef = useRef<{ pointerId: number; startX: number; startY: number; originWidth: number; moved: boolean } | null>(null);
  const callPipSuppressClickRef = useRef(false);
  const conversationLongPressTimerRef = useRef<number | null>(null);
  const conversationLongPressTriggeredRef = useRef(false);
  const titleClickTimerRef = useRef<number | null>(null);
  const titleClickCountRef = useRef(0);
  const videoPreviewLongPressTimerRef = useRef<number | null>(null);
  const videoPreviewLongPressTriggeredRef = useRef(false);
  const messageLongPressTimerRef = useRef<number | null>(null);
  const messageLongPressTriggeredRef = useRef(false);

  const t = copy[uiLanguage];
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0] ?? defaultConversation;
  const currentMessages = messagesByConversation[selected.id] ?? [];
  const previewRotationClass = previewRotation % 180 === 0 ? "max-h-[82vh] max-w-[96vw]" : "max-h-[96vw] max-w-[82vh]";
  const mediaLibraryMessages = currentMessages.filter((message) => message.mediaUrl && ["image", "video", "audio", "file"].includes(message.type));
  const filteredMediaLibraryMessages = mediaLibraryFilter === "all" ? mediaLibraryMessages : mediaLibraryMessages.filter((message) => message.type === mediaLibraryFilter);
  const mediaLibraryFilters: Array<{ key: MediaLibraryFilter; label: string }> = [
    { key: "all", label: t.mediaAll },
    { key: "image", label: t.mediaImages },
    { key: "video", label: t.mediaVideos },
    { key: "audio", label: t.mediaAudios },
    { key: "file", label: t.mediaDocs }
  ];
  const messageSearchTypes: Array<{ key: MessageSearchType; label: string }> = [
    { key: "all", label: uiLanguage === "zh" ? "??" : "All" },
    { key: "text", label: uiLanguage === "zh" ? "??" : "Text" },
    { key: "image", label: uiLanguage === "zh" ? "??" : "Images" },
    { key: "video", label: uiLanguage === "zh" ? "??" : "Videos" },
    { key: "audio", label: uiLanguage === "zh" ? "??" : "Audio" },
    { key: "file", label: uiLanguage === "zh" ? "??" : "Files" }
  ];
  const messageSearchActive = Boolean(messageSearchQuery.trim() || messageSearchDate || messageSearchType !== "all");
  const messageSearchResults = useMemo(() => {
    const keyword = messageSearchQuery.trim().toLowerCase();
    if (!keyword && !messageSearchDate && messageSearchType === "all") return [] as MessagePayload[];
    return currentMessages
      .filter((message) => {
        if (messageSearchType !== "all" && message.type !== messageSearchType) return false;
        if (messageSearchDate && !message.createdAt.startsWith(messageSearchDate)) return false;
        if (!keyword) return true;
        const translatedText = message.translations ? Object.values(message.translations).filter(Boolean).join(" ") : "";
        const haystack = [message.body, message.senderName, message.transcript, translatedText].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(keyword);
      })
      .slice(-30)
      .reverse();
  }, [currentMessages, messageSearchDate, messageSearchQuery, messageSearchType]);
  const selectedExists = conversations.some((item) => item.id === selected.id);
  const selectedMessageLoadState = messageLoadStates[selected.id] ?? "ready";
  const contactConversations = useMemo(() => conversations.filter((item) => item.type === "single"), [conversations]);
  const visibleFriends = useMemo(() => friends.filter((friend) => !hiddenContactUserIds.has(friend.id)), [friends, hiddenContactUserIds]);
  const groupCandidateUsers = useMemo(() => {
    const byId = new Map<string, SearchUser>();
    for (const friend of visibleFriends) byId.set(friend.id, friend);
    return Array.from(byId.values());
  }, [visibleFriends]);
  const selectedContactUser = selected.otherUser ?? (selectedExists ? { id: selected.id, nickname: selected.name, avatarUrl: selected.avatarUrl, language: "en" as UserLanguage, online: selected.online } : null);
  const selectedPeerOnline = selected.type === "single" ? Boolean(selected.otherUser?.id && onlineUserIds.has(selected.otherUser.id)) || Boolean(selected.online) : false;
  const ownOnline = connectionState === "connected";
  const ownAvatarUrl = profileAvatarPreviewUrl || profileAvatarUrl || currentUser?.avatarUrl || "";
  const callUserDirectory = useMemo(() => {
    const byId = new Map<string, SearchUser>();
    for (const friend of friends) byId.set(friend.id, friend);
    for (const item of contactConversations) {
      if (item.otherUser) byId.set(item.otherUser.id, item.otherUser);
    }
    for (const member of groupMembers) byId.set(member.user.id, member.user);
    if (selectedContactUser) byId.set(selectedContactUser.id, selectedContactUser);
    return byId;
  }, [contactConversations, friends, groupMembers, selectedContactUser]);
  const callTiles: CallTileView[] = activeCall ? [
    ...remoteCallStreams.map((remote) => {
      const user = callUserDirectory.get(remote.userId);
      const cameraOff = remote.cameraOff ?? remoteCameraOffByUserId[remote.userId] ?? false;
      return { id: `remote:${remote.userId}`, name: remote.name, stream: remote.stream, muted: false, videoEnabled: remote.media === "video" && !cameraOff, avatarUrl: user?.avatarUrl };
    }),
    { id: "local", name: callLabels[uiLanguage].localUser, stream: localCallStream, muted: true, videoEnabled: activeCall.media === "video" && !activeCall.cameraOff, avatarUrl: ownAvatarUrl, isLocal: true }
  ] : [];
  const focusedCallTile = callTiles.find((tile) => tile.id === focusedCallTileId) ?? callTiles.find((tile) => !tile.isLocal) ?? callTiles[0] ?? null;
  const secondaryCallTiles = focusedCallTile ? callTiles.filter((tile) => tile.id !== focusedCallTile.id) : callTiles;
  const floatingCallTile = callExpanded ? secondaryCallTiles[0] ?? null : null;
  function clampCallPipPosition(x: number, y: number) {
    if (typeof window === "undefined") return { x, y };
    const pipWidth = callPipSize.width;
    const pipHeight = callPipSize.height;
    const margin = 12;
    return {
      x: Math.min(Math.max(margin, x), Math.max(margin, window.innerWidth - pipWidth - margin)),
      y: Math.min(Math.max(64, y), Math.max(64, window.innerHeight - pipHeight - 84))
    };
  }
  function beginCallPipDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const pointer = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: callPipPosition.x, originY: callPipPosition.y, moved: false };
    callPipDragRef.current = pointer;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCallPip(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = callPipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) {
      drag.moved = true;
      callPipSuppressClickRef.current = true;
    }
    setCallPipPosition(clampCallPipPosition(drag.originX + dx, drag.originY + dy));
  }
  function endCallPipDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = callPipDragRef.current;
    if (drag?.pointerId === event.pointerId) callPipDragRef.current = null;
  }
  function clampCallPipWidth(width: number) {
    if (typeof window === "undefined") return Math.min(Math.max(96, width), 220);
    const maxByWidth = window.innerWidth - 24;
    const maxByHeight = Math.max(96, Math.floor((window.innerHeight - 148) * 9 / 16));
    const maxWidth = Math.min(260, maxByWidth, maxByHeight);
    return Math.min(Math.max(96, width), maxWidth);
  }
  function beginCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.stopPropagation();
    callPipResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originWidth: callPipSize.width, moved: false };
    callPipSuppressClickRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = callPipResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const delta = Math.max(event.clientX - resize.startX, event.clientY - resize.startY);
    if (Math.abs(delta) > 4) {
      resize.moved = true;
      callPipSuppressClickRef.current = true;
    }
    const width = clampCallPipWidth(resize.originWidth + delta);
    const nextSize = { width, height: Math.round(width * 16 / 9) };
    setCallPipSize(nextSize);
    setCallPipPosition((position) => {
      if (typeof window === "undefined") return position;
      const margin = 12;
      return {
        x: Math.min(Math.max(margin, position.x), Math.max(margin, window.innerWidth - nextSize.width - margin)),
        y: Math.min(Math.max(64, position.y), Math.max(64, window.innerHeight - nextSize.height - 84))
      };
    });
  }
  function endCallPipResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = callPipResizeRef.current;
    if (resize?.pointerId === event.pointerId) callPipResizeRef.current = null;
  }
  const avatarCropBaseScale = avatarCropImageSize.width && avatarCropImageSize.height ? Math.max(avatarCropFrameSize / avatarCropImageSize.width, avatarCropFrameSize / avatarCropImageSize.height) : 1;
  const avatarCropPreviewWidth = avatarCropImageSize.width ? avatarCropImageSize.width * avatarCropBaseScale : avatarCropFrameSize;
  const avatarCropPreviewHeight = avatarCropImageSize.height ? avatarCropImageSize.height * avatarCropBaseScale : avatarCropFrameSize;

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const visible = conversations
      .filter((item) => !hiddenConversationIds.has(item.id))
      .sort((left, right) => compareConversations(left, right, pinnedConversationIds));
    if (!keyword) return visible;
    return visible.filter((item) => item.name.toLowerCase().includes(keyword) || item.preview.toLowerCase().includes(keyword));
  }, [conversations, hiddenConversationIds, pinnedConversationIds, query]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    cancelMessageSelection();
  }, [selectedId]);

  useEffect(() => {
    if (!pendingShortcutConversationId) return;
    if (!conversations.some((item) => item.id === pendingShortcutConversationId)) return;
    selectConversation(pendingShortcutConversationId);
    setPendingShortcutConversationId("");
  }, [conversations, pendingShortcutConversationId]);

  useEffect(() => {
    mobilePaneRef.current = mobilePane;
  }, [mobilePane]);

  useEffect(() => {
    translationTargetLanguageRef.current = translationTargetLanguage;
    window.localStorage.setItem("glimpse.translationTargetLanguage", translationTargetLanguage);
  }, [translationTargetLanguage]);

  useEffect(() => {
    window.localStorage.setItem("glimpse.messageDisplayMode", messageDisplayMode);
  }, [messageDisplayMode]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.showSenderNames", showSenderNames ? "true" : "false");
  }, [showSenderNames]);

  useEffect(() => {
    if (!currentUser) return;
    setProfilePublicId(currentUser.publicId ?? "");
    setProfileIsPublic(currentUser.profilePublic !== false);
    setProfileEmailPublic(currentUser.profileEmailPublic === true);
    setProfilePhonePublic(currentUser.profilePhonePublic === true);
    setProfileNicknameValue(currentUser.nickname ?? "");
    setProfileAvatarPreviewUrl(getStoredAvatarPreview(currentUser.id));
    setProfileAvatarUrl(normalizeMediaUrl(currentUser.avatarUrl ?? undefined) ?? "");
    setProfileCompany(currentUser.company ?? "");
    setProfileTitle(currentUser.title ?? "");
    setProfileLocation(currentUser.location ?? "");
    setProfileBio(currentUser.bio ?? "");
    setProfileSignature(currentUser.signature ?? "");
  }, [currentUser]);
  useEffect(() => {
    window.localStorage.setItem("glimpse.speechAccent", speechAccent);
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingMessageKey("");
  }, [speechAccent]);

  useEffect(() => {
    setRemoveContactClearHistory(false);
  }, [contactDetailsUser?.id]);

  useEffect(() => {
    notificationsEnabledRef.current = notificationsEnabled;
    window.localStorage.setItem("glimpse.notificationsEnabled", String(notificationsEnabled));
  }, [notificationsEnabled]);

  useEffect(() => {
    notificationSoundEnabledRef.current = notificationSoundEnabled;
    window.localStorage.setItem("glimpse.notificationSoundEnabled", String(notificationSoundEnabled));
  }, [notificationSoundEnabled]);

  useEffect(() => {
    notificationVibrationEnabledRef.current = notificationVibrationEnabled;
    window.localStorage.setItem("glimpse.notificationVibrationEnabled", String(notificationVibrationEnabled));
  }, [notificationVibrationEnabled]);

  useEffect(() => {
    tabRef.current = tab;
  }, [tab]);

  useEffect(() => {
    onlineUserIdsRef.current = onlineUserIds;
  }, [onlineUserIds]);

  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser?.id) {
      setPinnedConversationIds(new Set());
      setHiddenConversationIds(new Set());
      setHiddenContactUserIds(new Set());
      return;
    }
    setPinnedConversationIds(readStoredIdSet(conversationPinsStorageKey(currentUser.id)));
    setHiddenConversationIds(readStoredIdSet(conversationHiddenStorageKey(currentUser.id)));
    setHiddenContactUserIds(readStoredIdSet(hiddenContactsStorageKey(currentUser.id)));
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(conversationPinsStorageKey(currentUser.id), pinnedConversationIds);
  }, [currentUser?.id, pinnedConversationIds]);

  useEffect(() => {
    if (!currentUser?.id) {
      setMessageReminders([]);
      return;
    }
    try {
      const stored = window.localStorage.getItem(messageRemindersStorageKey(currentUser.id));
      const parsed = stored ? JSON.parse(stored) : [];
      setMessageReminders(Array.isArray(parsed) ? parsed : []);
    } catch {
      setMessageReminders([]);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    if (currentUser?.id) window.localStorage.setItem(messageRemindersStorageKey(currentUser.id), JSON.stringify(messageReminders));
  }, [currentUser?.id, messageReminders]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      setMessageReminders((items) => items.map((item) => {
        if (item.done || new Date(item.remindAt).getTime() > now) return item;
        const title = messageActionLabels[uiLanguage].reminderDue;
        const body = `${item.title}: ${item.body}`;
        if (notificationSoundEnabledRef.current) playNotificationSound();
        if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted") {
          new window.Notification(title, { body, tag: `glimpse-reminder-${item.id}` });
        } else {
          setNotice(`${title}: ${body}`);
        }
        return { ...item, done: true };
      }));
    }, 30000);
    return () => window.clearInterval(timer);
  }, [uiLanguage]);

  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(conversationHiddenStorageKey(currentUser.id), hiddenConversationIds);
  }, [currentUser?.id, hiddenConversationIds]);


  useEffect(() => {
    if (currentUser?.id) writeStoredIdSet(hiddenContactsStorageKey(currentUser.id), hiddenContactUserIds);
  }, [currentUser?.id, hiddenContactUserIds]);

  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  useEffect(() => {
    voiceTranscriptDraftRef.current = voiceTranscriptDraft;
  }, [voiceTranscriptDraft]);

  useEffect(() => {
    return () => {
      if (pendingVoicePreview?.url) URL.revokeObjectURL(pendingVoicePreview.url);
    };
  }, [pendingVoicePreview?.url]);

  useEffect(() => {
    messagesByConversationRef.current = messagesByConversation;
  }, [messagesByConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    setConversations((items) => items.map((item) => item.type === "single" && item.otherUser ? { ...item, online: onlineUserIds.has(item.otherUser.id), otherUser: { ...item.otherUser, online: onlineUserIds.has(item.otherUser.id) } } : item));
    setFriends((items) => items.map((item) => ({ ...item, online: onlineUserIds.has(item.id) })));
    setContactResults((items) => items.map((item) => ({ ...item, online: onlineUserIds.has(item.id) })));
  }, [onlineUserIds]);

  useEffect(() => {
    setGroupAnnouncementDismissedForId(null);
  }, [selected.id, selected.announcement, selected.announcementScroll]);

  useEffect(() => {
    messageStatusesRef.current = messageStatuses;
  }, [messageStatuses]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    let cancelled = false;
    async function applyCallSystemPresence() {
      if (typeof navigator === "undefined") return;
      if (!activeCall) {
        if (callWakeLockRef.current) {
          try { await callWakeLockRef.current.release(); } catch { undefined; }
          callWakeLockRef.current = null;
        }
        if ("mediaSession" in navigator) {
          try { navigator.mediaSession.metadata = null; } catch { undefined; }
        }
        return;
      }
      if ("mediaSession" in navigator && typeof MediaMetadata !== "undefined") {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: activeCall.peerName,
            artist: activeCall.media === "video" ? "Glimpse video call" : "Glimpse voice call",
            album: activeCall.status === "active" ? "In call" : "Calling"
          });
          navigator.mediaSession.playbackState = "playing";
        } catch { undefined; }
      }
      const wakeLockNavigator = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
      if (!callWakeLockRef.current && wakeLockNavigator.wakeLock?.request) {
        try {
          const lock = await wakeLockNavigator.wakeLock.request("screen");
          if (cancelled || !activeCallRef.current) {
            try { await lock.release(); } catch { undefined; }
            return;
          }
          callWakeLockRef.current = lock;
        } catch { undefined; }
      }
    }
    void applyCallSystemPresence();
    return () => { cancelled = true; };
  }, [activeCall?.callId, activeCall?.media, activeCall?.peerName, activeCall?.status]);

  useEffect(() => {
    localCallStreamRef.current = localCallStream;
  }, [localCallStream]);
  useEffect(() => {
    cameraFacingRef.current = cameraFacing;
  }, [cameraFacing]);

  useEffect(() => {
    const shouldPlayTone = Boolean(incomingCall) || Boolean(activeCall && activeCall.status !== "active");
    if (!shouldPlayTone || typeof window === "undefined") return;
    let audioContext: AudioContext | null = null;
    let stopped = false;
    const playTone = () => {
      if (stopped) return;
      try {
        audioContext ??= new AudioContext();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = incomingCall ? 880 : 520;
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.24);
      } catch {
        // Browser may block notification audio until the page receives a user gesture.
      }
    };
    playTone();
    const timer = window.setInterval(playTone, incomingCall ? 1500 : 2200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      void audioContext?.close().catch(() => undefined);
    };
  }, [incomingCall?.callId, activeCall?.callId, activeCall?.status]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);
  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) return;

    let cancelled = false;
    async function restoreSession(auth: AuthResponse) {
      try {
        const data = await apiJson<{ user: PublicUser }>("/auth/me", auth.accessToken);
        if (cancelled) return;
        const restored = { ...auth, user: { ...auth.user, ...data.user } };
        storeAuth(restored);
        setAccessToken(restored.accessToken);
        setCurrentUser(restored.user);
      } catch {
        clearStoredAuth();
        if (!cancelled) {
          setAccessToken("");
          setCurrentUser(null);
          setAuthError(copy.en.sessionExpired);
        }
      }
    }

    void restoreSession(stored);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!accessToken || !currentUser) return;
    const socket = io(getSocketUrl(), {
      transports: ["websocket", "polling"],
      withCredentials: true,
      auth: { token: accessToken }
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      setConnectionState("connected");
      const selectedConversationId = selectedIdRef.current;
      if (selectedConversationId && isConversationOpen(selectedConversationId)) socket.emit("conversation:join", { conversationId: selectedConversationId });
    });
    socket.on("disconnect", () => {
      setIsConnected(false);
      setConnectionState(navigator.onLine ? "reconnecting" : "offline");
    });
    socket.on("presence:state", (payload: { onlineUserIds?: string[] }) => {
      setOnlineUserIds(new Set(payload.onlineUserIds ?? []));
    });
    socket.on("presence:update", (payload: { userId?: string; online?: boolean }) => {
      if (!payload.userId) return;
      setOnlineUserIds((current) => {
        const next = new Set(current);
        if (payload.online) next.add(payload.userId!);
        else next.delete(payload.userId!);
        return next;
      });
    });
    socket.on("auth:error", (payload: { message?: string }) => {
      clearStoredAuth();
      setAccessToken("");
      setCurrentUser(null);
      setIsConnected(false);
      setConnectionState("offline");
      setAuthError(payload.message || t.sessionExpired);
      socket.disconnect();
    });
    socket.on("conversation:history", (payload: ConversationHistoryResponse) => {
      setMessagesByConversation((current) => ({
        ...current,
        [payload.conversationId]: mergeMessages(current[payload.conversationId] ?? [], payload.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [payload.conversationId]: payload.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [payload.conversationId]: !payload.nextCursor }));
      setMessageLoadStates((current) => ({ ...current, [payload.conversationId]: "ready" }));
      setConversations((items) => items.map((item) => (item.id === payload.conversationId ? { ...item, unread: 0 } : item)));
      if (payload.conversationId === selectedIdRef.current && isConversationOpen(payload.conversationId)) requestScrollToBottom("auto");
      queueAutoTranslations(payload.messages, translationTargetLanguageRef.current);
    });
    socket.on("message:new", (message: MessagePayload) => {
      if (message.senderId === currentUserIdRef.current) {
        setMessageStatuses((current) => ({ ...current, [message.id]: mergeMessageStatus(current[message.id], "delivered") }));
      }
      setHiddenConversationIds((current) => current.has(message.conversationId) ? new Set(Array.from(current).filter((id) => id !== message.conversationId)) : current);
      setMessagesByConversation((current) => ({
        ...current,
        [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
      }));
      const conversationOpen = isConversationOpen(message.conversationId);
      setConversations((items) =>
        items.map((item) =>
          item.id === message.conversationId
            ? {
                ...item,
                preview: mediaPreviewLabel(message) || item.preview,
                time: formatConversationTime(message.createdAt),
                latestMessageAt: message.createdAt,
                unread: message.senderId === currentUserIdRef.current || conversationOpen ? item.unread : item.unread + 1
              }
            : item
        )
      );
      if (conversationOpen && message.senderId !== currentUserIdRef.current) {
        void markConversationRead(message.conversationId);
      }
      if (!conversationOpen && message.senderId !== currentUserIdRef.current) {
        notifyIncomingMessage(message);
      }
      if (conversationOpen) showLatestMessageAttention(message.id);
      queueAutoTranslation(message, translationTargetLanguageRef.current);
    });
    socket.on("message:revoked", (message: MessagePayload) => {
      applyRevokedMessage(message);
    });
    socket.on("call:signal", (event: CallSignalEvent) => {
      void handleCallSignal(event);
    });

    socket.on("conversation:read", (payload: { conversationId?: string; userId?: string; readAt?: string }) => {
      if (!payload.conversationId || !payload.userId || !payload.readAt || payload.userId === currentUserIdRef.current) return;
      const readTime = new Date(payload.readAt).getTime();
      if (Number.isNaN(readTime)) return;
      const messages = messagesByConversationRef.current[payload.conversationId] ?? [];
      setMessageStatuses((current) => {
        let changed = false;
        const next = { ...current };
        for (const message of messages) {
          if (message.senderId !== currentUserIdRef.current) continue;
          if (new Date(message.createdAt).getTime() > readTime) continue;
          const merged = mergeMessageStatus(next[message.id], "read");
          if (merged !== next[message.id]) {
            next[message.id] = merged;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [accessToken, currentUser]);

  useEffect(() => {
    if (!socketRef.current?.connected) return;
    for (const item of conversations) watchConversation(item.id);
  }, [conversations, isConnected]);
  useEffect(() => {
    if (socketRef.current?.connected && conversations.some((item) => item.id === selectedId) && isConversationOpen(selectedId)) {
      socketRef.current.emit("conversation:join", { conversationId: selectedId });
    }
  }, [selectedId, conversations, mobilePane]);

  useEffect(() => {
    if (!accessToken) return;

    function resumeRealtime() {
      if (document.visibilityState === "hidden") return;
      if (!navigator.onLine) {
        setConnectionState("offline");
        return;
      }
      const socket = socketRef.current;
      const selectedConversationId = selectedIdRef.current;
      if (socket && !socket.connected) {
        setConnectionState("reconnecting");
        socket.connect();
      } else if (socket?.connected) {
        setConnectionState("connected");
        setIsConnected(true);
      }
      if (socket?.connected && selectedConversationId && isConversationOpen(selectedConversationId)) joinConversation(selectedConversationId);
      void loadConversations(accessToken);
    }

    function markOffline() {
      setIsConnected(false);
      setConnectionState("offline");
    }

    document.addEventListener("visibilitychange", resumeRealtime);
    window.addEventListener("focus", resumeRealtime);
    window.addEventListener("online", resumeRealtime);
    window.addEventListener("offline", markOffline);
    return () => {
      document.removeEventListener("visibilitychange", resumeRealtime);
      window.removeEventListener("focus", resumeRealtime);
      window.removeEventListener("online", resumeRealtime);
      window.removeEventListener("offline", markOffline);
    };
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    void loadConversations(accessToken);
  }, [accessToken]);


  useEffect(() => {
    if (!accessToken || tab !== "contacts") return;
    void loadFriendData(accessToken);
  }, [accessToken, tab]);
  useEffect(() => {
    if (!accessToken || tab !== "contacts" || query.trim().length < 2) {
      setContactResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchUsers(query);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [accessToken, tab, query]);

  useEffect(() => {
    if (!accessToken || !selectedExists) return;
    queueAutoTranslations(currentMessages, translationTargetLanguage);
  }, [accessToken, selectedExists, currentMessages, translationTargetLanguage]);

  useEffect(() => {
    if (!pendingScrollToBottomRef.current) return;
    pendingScrollToBottomRef.current = false;
    const behavior = pendingScrollBehaviorRef.current;
    window.requestAnimationFrame(() => scrollMessagesToBottom(behavior));
  }, [currentMessages.length, selected.id]);
  async function loadConversations(token = accessToken) {
    if (!token) return;
    setConversationsLoading(true);
    setConversationsFailed(false);
    try {
      const data = await apiJson<{ conversations: ConversationSummary[] }>("/conversations", token);
      const mapped = data.conversations.map(mapConversation);
      setConversations(mapped);
      for (const item of mapped) watchConversation(item.id);
      setHistoryCursors((current) => Object.fromEntries(mapped.map((item) => [item.id, current[item.id]])));
      setHistoryEndReached((current) => Object.fromEntries(mapped.map((item) => [item.id, current[item.id] ?? false])));
      const first = mapped[0];
      const nextSelectedId = mapped.some((item) => item.id === selectedIdRef.current) ? selectedIdRef.current : first?.id;
      if (nextSelectedId && nextSelectedId !== selectedIdRef.current) setSelectedId(nextSelectedId);
      if (nextSelectedId) await loadConversationHistory(nextSelectedId, token, "auto");
    } catch (error) {
      setConversationsFailed(true);
      setNotice(extractErrorMessage(error, t.requestFailed));
    } finally {
      setConversationsLoading(false);
    }
  }

  async function loadConversationHistory(conversationId: string, token = accessToken, scrollBehavior: ScrollBehavior = "auto") {
    setMessageLoadStates((current) => ({ ...current, [conversationId]: "loading" }));
    try {
      const data = await apiJson<ConversationHistoryResponse>(`/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`, token);
      setMessagesByConversation((current) => ({
        ...current,
        [data.conversationId]: mergeMessages(current[data.conversationId] ?? [], data.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [data.conversationId]: data.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [data.conversationId]: !data.nextCursor }));
      setMessageLoadStates((current) => ({ ...current, [data.conversationId]: "ready" }));
      queueAutoTranslations(data.messages, translationTargetLanguageRef.current);
      if (data.conversationId === selectedIdRef.current && isConversationOpen(data.conversationId)) requestScrollToBottom(scrollBehavior);
    } catch (error) {
      setMessageLoadStates((current) => ({ ...current, [conversationId]: "failed" }));
      setNotice(extractErrorMessage(error, t.requestFailed));
    }
  }

  function watchConversation(conversationId: string) {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit("conversation:watch", { conversationId });
  }

  function joinConversation(conversationId: string) {
    const socket = socketRef.current;
    if (!socket?.connected) return;
    setMessageLoadStates((current) => ({ ...current, [conversationId]: "loading" }));
    socket.emit("conversation:join", { conversationId }, (response?: { ok?: boolean }) => {
      if (!response?.ok) setMessageLoadStates((current) => ({ ...current, [conversationId]: "failed" }));
    });
  }

  function emitCallSignal(payload: Omit<CallSignalPayload, "conversationId" | "callId" | "media"> & { conversationId?: string; callId?: string; media?: CallMediaKind }) {
    const call = activeCallRef.current;
    const conversationId = payload.conversationId ?? call?.conversationId;
    const callId = payload.callId ?? call?.callId;
    const media = payload.media ?? call?.media;
    const socket = socketRef.current;
    if (!socket?.connected || !conversationId || !callId || !media) return;
    socket.emit("call:signal", { ...payload, conversationId, callId, media });
  }

  function stopLocalCallStream() {
    localCallStreamRef.current?.getTracks().forEach((track) => track.stop());
    localCallStreamRef.current = null;
    setLocalCallStream(null);
  }

  function closePeerConnections() {
    Object.values(peerConnectionsRef.current).forEach((peer) => peer.close());
    peerConnectionsRef.current = {};
    pendingIceCandidatesRef.current = {};
    setRemoteCallStreams([]);
  }

  function callMediaErrorMessage(error: unknown) {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      return uiLanguage === "zh" ? "当前页面不是安全上下文，浏览器不允许访问麦克风或摄像头。请使用 localhost 或 HTTPS。" : "This page is not a secure context, so the browser will not allow microphone/camera access. Use localhost or HTTPS.";
    }
    if (error instanceof DOMException) {
      if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") return uiLanguage === "zh" ? "麦克风或摄像头权限被拒绝，请在浏览器权限中允许后重试。" : "Microphone or camera permission was denied. Allow it in browser permissions and try again.";
      if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") return uiLanguage === "zh" ? "没有找到可用的麦克风或摄像头。" : "No available microphone or camera was found.";
      if (error.name === "NotReadableError") return uiLanguage === "zh" ? "麦克风或摄像头正在被其他应用占用。" : "The microphone or camera is being used by another app.";
    }
    return error instanceof Error && error.message ? localizeNoticeMessage(error.message, uiLanguage) : callLabels[uiLanguage].permissionFailed;
  }

  async function ensureLocalCallStream(media: CallMediaKind) {
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
      throw new Error(callLabels[uiLanguage].notSupported);
    }
    const existing = localCallStreamRef.current;
    const hasAudio = existing?.getAudioTracks().some((track) => track.readyState === "live");
    const hasVideo = existing?.getVideoTracks().some((track) => track.readyState === "live");
    if (existing && hasAudio && (media === "audio" || hasVideo)) return existing;
    stopLocalCallStream();
    const videoConstraints = media === "video" ? { facingMode: { ideal: cameraFacingRef.current } } : false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: videoConstraints });
    localCallStreamRef.current = stream;
    setLocalCallStream(stream);
    return stream;
  }

  function callPeerKey(userId: string) {
    return userId || "unknown";
  }

  async function flushPendingIceCandidates(userId: string) {
    const peer = peerConnectionsRef.current[callPeerKey(userId)];
    const candidates = pendingIceCandidatesRef.current[callPeerKey(userId)] ?? [];
    if (!peer?.remoteDescription || candidates.length === 0) return;
    pendingIceCandidatesRef.current[callPeerKey(userId)] = [];
    for (const candidate of candidates) {
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore stale ICE candidates from a closed or replaced peer.
      }
    }
  }

  function createPeerConnection(remoteUserId: string, remoteName: string, call: ActiveCall) {
    const key = callPeerKey(remoteUserId);
    const existing = peerConnectionsRef.current[key];
    if (existing && existing.connectionState !== "closed") return existing;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peerConnectionsRef.current[key] = peer;
    localCallStreamRef.current?.getTracks().forEach((track) => {
      const stream = localCallStreamRef.current;
      if (stream) peer.addTrack(track, stream);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      emitCallSignal({ signalType: "ice-candidate", targetUserId: remoteUserId, candidate: event.candidate.toJSON(), conversationId: call.conversationId, callId: call.callId, media: call.media });
    };
    peer.ontrack = (event) => {
      const stream = event.streams[0];
      if (!stream) return;
      setRemoteCallStreams((items) => {
        const next = items.filter((item) => item.userId !== remoteUserId);
        return [...next, { userId: remoteUserId, name: remoteName || call.peerName, stream, media: call.media }];
      });
      setActiveCall((current) => current && current.callId === call.callId ? { ...current, status: "active" } : current);
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) {
        setRemoteCallStreams((items) => items.filter((item) => item.userId !== remoteUserId));
      }
    };
    return peer;
  }

  async function createOfferForPeer(remoteUserId: string, remoteName: string, call = activeCallRef.current) {
    if (!call || remoteUserId === currentUserIdRef.current) return;
    await ensureLocalCallStream(call.media);
    const peer = createPeerConnection(remoteUserId, remoteName, call);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    emitCallSignal({ signalType: "offer", targetUserId: remoteUserId, sdp: offer.sdp, conversationId: call.conversationId, callId: call.callId, media: call.media });
  }

  async function answerOffer(event: IncomingCall | CallSignalEvent) {
    const call: ActiveCall = activeCallRef.current ?? {
      callId: event.callId,
      conversationId: event.conversationId,
      media: event.media,
      status: "connecting",
      direction: "incoming",
      peerName: event.fromName ?? selected.name,
      startedAt: Date.now(),
      muted: false,
      cameraOff: false
    };
    setActiveCall(call);
    activeCallRef.current = call;
    await ensureLocalCallStream(event.media);
    const peer = createPeerConnection(event.fromUserId, event.fromName ?? selected.name, call);
    if ("sdp" in event && event.sdp) {
      await peer.setRemoteDescription({ type: "offer", sdp: event.sdp });
      await flushPendingIceCandidates(event.fromUserId);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      emitCallSignal({ signalType: "answer", targetUserId: event.fromUserId, sdp: answer.sdp, conversationId: event.conversationId, callId: event.callId, media: event.media });
    }
  }

  async function startCall(media: CallMediaKind) {
    if (activeCallRef.current) {
      const message = callLabels[uiLanguage].callBusy;
      setCallError(message);
      setNotice(message);
      return;
    }
    const call: ActiveCall = {
      callId: createBrowserId(),
      conversationId: selected.id,
      media,
      status: "connecting",
      direction: "outgoing",
      peerName: selected.name,
      startedAt: Date.now(),
      muted: false,
      cameraOff: media === "audio"
    };
    activeCallRef.current = call;
    setActiveCall(call);
    setIncomingCall(null);
    setCallError("");
    try {
      const stream = await ensureLocalCallStream(media);
      const readyCall = {
        ...call,
        status: "ringing" as CallStatus,
        muted: stream.getAudioTracks().every((track) => !track.enabled),
        cameraOff: media === "video" ? stream.getVideoTracks().every((track) => !track.enabled) : true
      };
      activeCallRef.current = readyCall;
      setActiveCall(readyCall);
      emitCallSignal({ signalType: "join", conversationId: readyCall.conversationId, callId: readyCall.callId, media: readyCall.media });
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
      endActiveCall(false);
    }
  }

  async function acceptIncomingCall() {
    if (!incomingCall) return;
    try {
      setCallError("");
      const call: ActiveCall = {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        media: incomingCall.media,
        status: "connecting",
        direction: "incoming",
        peerName: incomingCall.fromName ?? selected.name,
        startedAt: Date.now(),
        muted: false,
        cameraOff: incomingCall.media === "audio"
      };
      activeCallRef.current = call;
      setActiveCall(call);
      setIncomingCall(null);
      await ensureLocalCallStream(incomingCall.media);
      if (incomingCall.signalType === "offer" && incomingCall.sdp) {
        await answerOffer(incomingCall);
      }
      emitCallSignal({ signalType: "join", conversationId: call.conversationId, callId: call.callId, media: call.media });
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
      endActiveCall(false);
    }
  }

  function rejectIncomingCall() {
    if (!incomingCall) return;
    emitCallSignal({ signalType: "reject", conversationId: incomingCall.conversationId, callId: incomingCall.callId, media: incomingCall.media, targetUserId: incomingCall.fromUserId });
    setIncomingCall(null);
  }

  function endActiveCall(notify = true) {
    const call = activeCallRef.current;
    if (notify && call) emitCallSignal({ signalType: "end", conversationId: call.conversationId, callId: call.callId, media: call.media });
    closePeerConnections();
    stopLocalCallStream();
    activeCallRef.current = null;
    setActiveCall(null);
    setRemoteCameraOffByUserId({});
    setCallExpanded(false);
    setFocusedCallTileId(null);
    setCallPipPosition({ x: 16, y: 88 });
    setCallPipSize({ width: 96, height: 171 });
    setIncomingCall(null);
  }

  async function handleCallSignal(event: CallSignalEvent) {
    if (event.fromUserId === currentUserIdRef.current) return;
    if (event.targetUserId && event.targetUserId !== currentUserIdRef.current) return;
    const current = activeCallRef.current;
    if (current && event.callId !== current.callId && ["join", "offer"].includes(event.signalType)) {
      emitCallSignal({ signalType: "busy", conversationId: event.conversationId, callId: event.callId, media: event.media, targetUserId: event.fromUserId });
      return;
    }
    if (event.signalType === "join") {
      if (!current) {
        setIncomingCall({ callId: event.callId, conversationId: event.conversationId, media: event.media, fromUserId: event.fromUserId, fromName: event.fromName, signalType: "join" });
        return;
      }
      if (current.callId === event.callId) await createOfferForPeer(event.fromUserId, event.fromName ?? selected.name, current);
      return;
    }
    if (event.signalType === "offer") {
      if (!event.sdp) return;
      if (!current) {
        setIncomingCall({ callId: event.callId, conversationId: event.conversationId, media: event.media, fromUserId: event.fromUserId, fromName: event.fromName, signalType: "offer", sdp: event.sdp });
        return;
      }
      await answerOffer(event);
      return;
    }
    if (event.signalType === "answer") {
      const peer = peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      if (peer && event.sdp) {
        await peer.setRemoteDescription({ type: "answer", sdp: event.sdp });
        await flushPendingIceCandidates(event.fromUserId);
        setActiveCall((call) => call && call.callId === event.callId ? { ...call, status: "active" } : call);
      }
      return;
    }
    if (event.signalType === "ice-candidate") {
      const candidate = event.candidate as RTCIceCandidateInit | undefined;
      if (!candidate) return;
      const key = callPeerKey(event.fromUserId);
      const peer = peerConnectionsRef.current[key];
      if (!peer?.remoteDescription) {
        pendingIceCandidatesRef.current[key] = [...(pendingIceCandidatesRef.current[key] ?? []), candidate];
        return;
      }
      try {
        await peer.addIceCandidate(candidate);
      } catch {
        // Ignore stale ICE candidates.
      }
      return;
    }
    if (event.signalType === "camera-state") {
      const cameraOff = Boolean(event.cameraOff);
      setRemoteCameraOffByUserId((items) => ({ ...items, [event.fromUserId]: cameraOff }));
      setRemoteCallStreams((items) => items.map((item) => item.userId === event.fromUserId ? { ...item, cameraOff } : item));
      return;
    }
    if (event.signalType === "reject") {
      setCallError(callLabels[uiLanguage].callRejected);
      if (selected.type === "single") endActiveCall(false);
      return;
    }
    if (event.signalType === "busy") {
      setCallError(callLabels[uiLanguage].callBusy);
      return;
    }
    if (event.signalType === "end") {
      setRemoteCallStreams((items) => items.filter((item) => item.userId !== event.fromUserId));
      const peer = peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      peer?.close();
      delete peerConnectionsRef.current[callPeerKey(event.fromUserId)];
      if (selected.type === "single") endActiveCall(false);
    }
  }

  function toggleCallMute() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream) return;
    const muted = !call.muted;
    stream.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    setActiveCall({ ...call, muted });
  }

  function toggleCallCamera() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream || call.media !== "video") return;
    const cameraOff = !call.cameraOff;
    stream.getVideoTracks().forEach((track) => { track.enabled = !cameraOff; });
    const nextCall = { ...call, cameraOff };
    activeCallRef.current = nextCall;
    setActiveCall(nextCall);
    emitCallSignal({ signalType: "camera-state", cameraOff });
  }



  async function switchCallCamera() {
    const call = activeCallRef.current;
    const stream = localCallStreamRef.current;
    if (!call || !stream || call.media !== "video") return;
    const nextFacing: CameraFacingMode = cameraFacingRef.current === "user" ? "environment" : "user";
    const getReplacementTrack = async (releaseCurrentFirst: boolean) => {
      const currentVideoTracks = stream.getVideoTracks();
      if (releaseCurrentFirst) {
        currentVideoTracks.forEach((track) => {
          stream.removeTrack(track);
          track.stop();
        });
        setLocalCallStream(new MediaStream(stream.getTracks()));
        await new Promise((resolve) => window.setTimeout(resolve, 250));
      }
      const nextStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing } } });
      const nextVideoTrack = nextStream.getVideoTracks()[0];
      if (!nextVideoTrack) throw new Error(callLabels[uiLanguage].permissionFailed);
      return nextVideoTrack;
    };
    const applyReplacementTrack = async (nextVideoTrack: MediaStreamTrack) => {
      stream.getVideoTracks().forEach((track) => {
        stream.removeTrack(track);
        track.stop();
      });
      stream.addTrack(nextVideoTrack);
      for (const peer of Object.values(peerConnectionsRef.current)) {
        const sender = peer.getSenders().find((item) => item.track?.kind === "video");
        if (sender) await sender.replaceTrack(nextVideoTrack);
      }
      cameraFacingRef.current = nextFacing;
      setCameraFacing(nextFacing);
      const nextCall = { ...call, cameraOff: false };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      emitCallSignal({ signalType: "camera-state", cameraOff: false });
      setLocalCallStream(new MediaStream(stream.getTracks()));
    };
    try {
      try {
        await applyReplacementTrack(await getReplacementTrack(false));
      } catch (firstError) {
        const errorName = firstError instanceof DOMException ? firstError.name : "";
        const shouldRetryAfterRelease = ["NotReadableError", "AbortError", "TrackStartError"].includes(errorName);
        if (!shouldRetryAfterRelease) throw firstError;
        await applyReplacementTrack(await getReplacementTrack(true));
      }
    } catch (error) {
      const message = callMediaErrorMessage(error);
      setCallError(message);
      setNotice(message);
    }
  }

  async function loadFriendData(token = accessToken) {
    if (!token) return;
    setFriendDataLoading(true);
    try {
      const friendsData = await apiJson<{ friends: SearchUser[] }>("/contacts/friends", token);
      setFriendRequests([]);
      setFriends(friendsData.friends.map((friend) => ({ ...friend, online: onlineUserIds.has(friend.id) })));
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    } finally {
      setFriendDataLoading(false);
    }
  }
  async function saveContact(user: SearchUser) {
    try {
      const data = await apiJson<{ friend: SearchUser }>("/contacts/friends", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const saved = { ...data.friend, avatarUrl: normalizeMediaUrl(data.friend.avatarUrl ?? undefined), online: onlineUserIds.has(data.friend.id) };
      setHiddenContactUserIds((current) => {
        const next = new Set(current);
        next.delete(saved.id);
        return next;
      });
      setFriends((items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
      setContactResults((items) => items.map((item) => item.id === saved.id ? { ...item, online: saved.online } : item));
      setNotice(t.contactSaved);
      await loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }



  async function blockUser(user: SearchUser) {
    try {
      const data = await apiJson<{ block: BlockedUserView }>("/contacts/blocks", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const normalizedBlock = { ...data.block, user: { ...data.block.user, avatarUrl: normalizeMediaUrl(data.block.user.avatarUrl ?? undefined) } };
      setBlockedUsers((items) => items.some((item) => item.user.id === user.id) ? items : [normalizedBlock, ...items]);
      setContactResults((items) => items.filter((item) => item.id !== user.id));
      setNotice(t.userBlocked);
      void loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }

  async function unblockUser(user: SearchUser) {
    try {
      await apiJson<{ ok: true }>(`/contacts/blocks/${encodeURIComponent(user.id)}`, accessToken, { method: "DELETE" });
      setBlockedUsers((items) => items.filter((block) => block.user.id !== user.id));
      setNotice(t.userUnblocked);
      void loadFriendData();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }
  async function removeFriend(friend: SearchUser, clearChatHistory = false) {
    setHiddenContactUserIds((current) => new Set(current).add(friend.id));
    setFriends((items) => items.filter((item) => item.id !== friend.id));
    if (clearChatHistory) {
      const conversation = conversationsRef.current.find((item) => item.type === "single" && item.otherUser?.id === friend.id);
      if (conversation) {
        setHiddenConversationIds((current) => new Set(current).add(conversation.id));
        setMessagesByConversation((current) => {
          const { [conversation.id]: _removed, ...rest } = current;
          return rest;
        });
        if (selectedIdRef.current === conversation.id) {
          const next = conversationsRef.current.find((item) => item.id !== conversation.id && !hiddenConversationIds.has(item.id));
          setSelectedId(next?.id ?? defaultConversation.id);
        }
      }
    }
    setContactDetailsUser(null);
    setRemoveContactClearHistory(false);
    setNotice(t.friendRemoved);
    try {
      await apiJson<{ ok: true }>(`/contacts/friends/${encodeURIComponent(friend.id)}`, accessToken, { method: "DELETE" });
    } catch {
      // Mutual-message contacts may not have a legacy friendRequest row. Keep local removal and chat history.
    }
  }
  async function respondFriendRequest(requestId: string, accepted: boolean) {
    try {
      await apiJson<{ request: FriendRequestView }>(`/contacts/friend-requests/${encodeURIComponent(requestId)}/${accepted ? "accept" : "reject"}`, accessToken, { method: "POST" });
      setNotice(accepted ? t.friendRequestAccepted : t.friendRequestRejected);
      await loadFriendData();
      if (accepted) await loadConversations();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.friendRequestFailed));
    }
  }
  async function searchUsers(keyword: string) {
    setContactsLoading(true);
    try {
      const data = await apiJson<{ users: SearchUser[] }>(`/contacts/search?q=${encodeURIComponent(keyword)}`, accessToken);
      setContactResults(data.users.map((user) => ({ ...user, online: onlineUserIds.has(user.id) })));
    } catch (error) {
      setNotice(extractErrorMessage(error, t.searchFailed));
    } finally {
      setContactsLoading(false);
    }
  }

  async function startDirectConversation(user: SearchUser) {
    try {
      const data = await apiJson<{ conversation: ConversationSummary }>("/conversations/direct", accessToken, {
        method: "POST",
        body: JSON.stringify({ userId: user.id })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
      setSelectedId(mapped.id);
      setTab("chats");
      setMobilePane("chat");
      requestScrollToBottom("auto");
      joinConversation(mapped.id);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.startConversationFailed));
    }
  }


  function toggleGroupMember(userId: string) {
    setGroupError("");
    setGroupSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function createGroupConversation() {
    if (groupCreating) return;
    setGroupError("");
    if (groupSelectedIds.length < 2) {
      setGroupError(t.groupNeedTwoFriends);
      return;
    }
    setGroupCreating(true);
    try {
      const fallbackTitle = groupSelectedIds
        .map((id) => groupCandidateUsers.find((friend) => friend.id === id)?.nickname)
        .filter(Boolean)
        .slice(0, 3)
        .join(", ");
      const data = await apiJson<{ conversation: ConversationSummary }>("/conversations/group", accessToken, {
        method: "POST",
        body: JSON.stringify({ title: groupTitleValue.trim() || fallbackTitle || t.createGroup, userIds: groupSelectedIds })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => [mapped, ...items.filter((item) => item.id !== mapped.id)]);
      setSelectedId(mapped.id);
      setTab("chats");
      setMobilePane("chat");
      setGroupModalOpen(false);
      setGroupTitleValue("");
      setGroupSelectedIds([]);
      setGroupError("");
      setNotice(t.groupCreated);
      requestScrollToBottom("auto");
      joinConversation(mapped.id);
    } catch (error) {
      const message = extractErrorMessage(error, t.groupCreateFailed);
      setGroupError(message);
      setNotice(message);
    } finally {
      setGroupCreating(false);
    }
  }
  function selectConversation(id: string) {
    setSelectedId(id);
    setTab("chats");
    setMobilePane("chat");
    setNotice("");
    setConversations((items) => items.map((item) => (item.id === id ? { ...item, unread: 0 } : item)));
    requestScrollToBottom("auto");
    void markConversationRead(id);
    joinConversation(id);
  }

  function jumpToLatestUnreadOrBottom() {
    const unreadConversation = filtered.find((item) => item.unread > 0 && !hiddenConversationIds.has(item.id));
    if (unreadConversation) {
      selectConversation(unreadConversation.id);
      window.setTimeout(() => scrollMessagesToBottom("smooth"), 120);
      return;
    }
    scrollMessagesToBottom("smooth");
    window.setTimeout(() => scrollMessagesToBottom("smooth"), 80);
  }

  function handleTitleClick() {
    titleClickCountRef.current += 1;
    if (titleClickTimerRef.current) window.clearTimeout(titleClickTimerRef.current);
    titleClickTimerRef.current = window.setTimeout(() => {
      titleClickCountRef.current = 0;
      titleClickTimerRef.current = null;
    }, 360);
    if (titleClickCountRef.current >= 2) {
      titleClickCountRef.current = 0;
      if (titleClickTimerRef.current) window.clearTimeout(titleClickTimerRef.current);
      titleClickTimerRef.current = null;
      jumpToLatestUnreadOrBottom();
    }
  }

  async function markConversationRead(conversationId: string) {
    if (!accessToken) return;
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("conversation:read", { conversationId }, (response?: { ok?: boolean }) => {
        if (!response?.ok) setNotice(t.readStateFailed);
      });
      return;
    }
    try {
      await apiJson<{ ok: true; readAt: string }>(`/conversations/${encodeURIComponent(conversationId)}/read`, accessToken, { method: "POST" });
    } catch (error) {
      setNotice(extractErrorMessage(error, t.readStateFailed));
    }
  }

  async function loadOlderMessages() {
    const before = currentMessages[0]?.createdAt ?? historyCursors[selected.id];
    if (!accessToken || !before || historyLoading) return;
    setHistoryLoading(true);
    try {
      const data = await apiJson<ConversationHistoryResponse>(`/conversations/${encodeURIComponent(selected.id)}/messages?before=${encodeURIComponent(before)}&limit=50`, accessToken);
      setMessagesByConversation((current) => ({
        ...current,
        [data.conversationId]: mergeMessages(current[data.conversationId] ?? [], data.messages)
      }));
      setHistoryCursors((current) => ({ ...current, [data.conversationId]: data.nextCursor }));
      setHistoryEndReached((current) => ({ ...current, [data.conversationId]: !data.nextCursor }));
      queueAutoTranslations(data.messages, translationTargetLanguageRef.current);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.olderMessagesFailed));
    } finally {
      setHistoryLoading(false);
    }
  }

  function focusMessageById(messageId: string) {
    if (typeof document === "undefined") return false;
    const element = document.getElementById(`message-${messageId}`);
    if (!element) return false;
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      setHighlightedMessageIds((current) => {
        const { [messageId]: _ignored, ...rest } = current;
        return rest;
      });
    }, 2200);
    return true;
  }

  async function jumpToMessage(messageId?: string) {
    if (!messageId) return;
    if (focusMessageById(messageId)) return;
    if (!historyCursors[selected.id]) {
      setNotice(t.noMoreMessages);
      return;
    }
    pendingQuoteJumpRef.current = messageId;
    await loadOlderMessages();
    window.setTimeout(() => {
      if (pendingQuoteJumpRef.current === messageId && !focusMessageById(messageId)) setNotice(t.loadOlder);
      if (pendingQuoteJumpRef.current === messageId) pendingQuoteJumpRef.current = null;
    }, 250);
  }

  async function jumpToQuotedMessage(messageId?: string) {
    await jumpToMessage(messageId);
  }

  function clearConversationLongPressTimer() {
    if (conversationLongPressTimerRef.current) {
      window.clearTimeout(conversationLongPressTimerRef.current);
      conversationLongPressTimerRef.current = null;
    }
  }

  function openConversationMenu(conversationId: string, x: number, y: number) {
    const left = Math.max(12, Math.min(x, window.innerWidth - 190));
    const top = Math.max(12, Math.min(y, window.innerHeight - 120));
    setConversationMenu({ conversationId, x: left, y: top });
  }

  function handleConversationContextMenu(event: React.MouseEvent<HTMLButtonElement>, conversationId: string) {
    event.preventDefault();
    openConversationMenu(conversationId, event.clientX, event.clientY);
  }

  function handleConversationPointerDown(event: ReactPointerEvent<HTMLButtonElement>, conversationId: string) {
    if (event.pointerType === "mouse") return;
    clearConversationLongPressTimer();
    conversationLongPressTriggeredRef.current = false;
    const x = event.clientX;
    const y = event.clientY;
    conversationLongPressTimerRef.current = window.setTimeout(() => {
      conversationLongPressTimerRef.current = null;
      conversationLongPressTriggeredRef.current = true;
      openConversationMenu(conversationId, x, y);
    }, 620);
  }

  function clearVideoPreviewLongPressTimer() {
    if (videoPreviewLongPressTimerRef.current) {
      window.clearTimeout(videoPreviewLongPressTimerRef.current);
      videoPreviewLongPressTimerRef.current = null;
    }
  }

  function openVideoPreview(url: string, name?: string, muted = false) {
    setPreviewMedia({ url, type: "video", name, muted });
  }

  function handleVideoPreviewPointerDown(event: ReactPointerEvent<HTMLButtonElement>, url: string, name?: string) {
    if (event.pointerType === "mouse") return;
    clearVideoPreviewLongPressTimer();
    videoPreviewLongPressTriggeredRef.current = false;
    videoPreviewLongPressTimerRef.current = window.setTimeout(() => {
      videoPreviewLongPressTimerRef.current = null;
      videoPreviewLongPressTriggeredRef.current = true;
      openVideoPreview(url, name, true);
    }, 620);
  }

  function handleVideoPreviewClick(url: string, name?: string) {
    if (videoPreviewLongPressTriggeredRef.current) {
      videoPreviewLongPressTriggeredRef.current = false;
      return;
    }
    openVideoPreview(url, name, false);
  }

  async function openArchivePreview(message: MessagePayload) {
    const path = archivePreviewPath(message);
    if (!path || !accessToken) return;
    setArchivePreview({ fileName: message.body || "Archive", totalEntries: 0, entries: [], truncated: false, loading: true });
    try {
      const data = await apiJson<ArchivePreviewResponse>(path, accessToken);
      setArchivePreview(data);
    } catch (error) {
      setArchivePreview({ fileName: message.body || "Archive", totalEntries: 0, entries: [], truncated: false, error: extractErrorMessage(error, t.requestFailed) });
    }
  }

  function toggleConversationPin(conversationId: string) {
    setPinnedConversationIds((current) => {
      const next = new Set(current);
      if (next.has(conversationId)) {
        next.delete(conversationId);
        setNotice(t.chatUnpinned);
      } else {
        next.add(conversationId);
        setNotice(t.chatPinned);
      }
      return next;
    });
    setConversationMenu(null);
  }

  function deleteConversationFromList(conversationId: string) {
    setHiddenConversationIds((current) => new Set(current).add(conversationId));
    setPinnedConversationIds((current) => {
      if (!current.has(conversationId)) return current;
      const next = new Set(current);
      next.delete(conversationId);
      return next;
    });
    setConversationMenu(null);
    setNotice(t.chatDeleted);
    if (selected.id === conversationId) {
      const next = conversations.find((item) => item.id !== conversationId && !hiddenConversationIds.has(item.id));
      if (next) selectConversation(next.id);
      else setMobilePane("list");
    }
  }
  function locateMediaMessage(messageId: string) {
    setMediaLibraryOpen(false);
    window.setTimeout(() => {
      void jumpToMessage(messageId);
    }, 80);
  }

  useEffect(() => {
    const messageId = pendingQuoteJumpRef.current;
    if (messageId && focusMessageById(messageId)) pendingQuoteJumpRef.current = null;
  }, [currentMessages]);

  function emitMessage(message: MessagePayload) {
    if (socketRef.current?.connected) {
      setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        setMessageStatuses((current) => ({ ...current, [message.id]: "failed" }));
        setNotice(t.requestFailed);
      }, 8000);

      socketRef.current.emit("message:send", message, (response?: { ok?: boolean; messageId?: string; error?: string; message?: string }) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        if (response?.ok && response.messageId) {
          const confirmedMessage: MessagePayload = { ...message, id: response.messageId, createdAt: message.createdAt };
          setMessagesByConversation((current) => ({
            ...current,
            [message.conversationId]: mergeMessages((current[message.conversationId] ?? []).filter((item) => item.id !== message.id), [confirmedMessage])
          }));
          setMessageStatuses((current) => {
            const { [message.id]: _localStatus, ...rest } = current;
            return { ...rest, [confirmedMessage.id]: mergeMessageStatus(current[message.id], "sent") };
          });
          showLatestMessageAttention(confirmedMessage.id);
          queueAutoTranslation(confirmedMessage, translationTargetLanguageRef.current);
          setNotice(t.sent);
          return;
        }
        setMessageStatuses((current) => ({ ...current, [message.id]: response?.ok ? mergeMessageStatus(current[message.id], "sent") : "failed" }));
        setNotice(response?.ok ? t.sent : extractErrorMessage(response?.error || response?.message || t.requestFailed, t.requestFailed));
      });
      return;
    }
    setMessageStatuses((current) => ({ ...current, [message.id]: "failed" }));
    setNotice(t.disconnected);
  }

  function retryMessage(message: MessagePayload) {
    setNotice("");
    emitMessage(message);
  }

  function updateNotificationsEnabled(enabled: boolean) {
    setNotificationsEnabled(enabled);
    if (enabled) requestBrowserNotificationPermission();
  }

  function requestBrowserNotificationPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (window.Notification.permission === "default") void window.Notification.requestPermission();
  }

  function notifyIncomingMessage(message: MessagePayload) {
    if (!notificationsEnabledRef.current) return;
    const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
    const title = conversation?.name || message.senderName || "Glimpse Chat";
    const body = message.body?.trim() || "New message";

    if (notificationSoundEnabledRef.current) playNotificationSound();
    if (notificationVibrationEnabledRef.current && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([120, 60, 120]);
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotice(`${title}: ${body}`);
      return;
    }

    if (window.Notification.permission === "granted") {
      const notification = new window.Notification(title, {
        body,
        tag: `glimpse-${message.conversationId}`,
      });
      notification.onclick = () => {
        window.focus();
        selectConversation(message.conversationId);
        notification.close();
      };
      return;
    }

    if (window.Notification.permission === "default") requestBrowserNotificationPermission();
    setNotice(`${title}: ${body}`);
  }

  function playNotificationSound() {
    if (typeof window === "undefined") return;
    const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) return;
    try {
      const audioContext = new AudioContextConstructor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
      window.setTimeout(() => void audioContext.close(), 320);
    } catch {
      // Some browsers require a recent user gesture before audio can play.
    }
  }

  function isConversationOpen(conversationId: string) {
    if (conversationId !== selectedIdRef.current || tabRef.current !== "chats") return false;
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return true;
    return mobilePaneRef.current === "chat";
  }

  function scrollMessagesToBottom(behavior: ScrollBehavior = "smooth") {
    const list = messageListRef.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior });
  }

  function requestScrollToBottom(behavior: ScrollBehavior = "smooth") {
    pendingScrollBehaviorRef.current = behavior;
    pendingScrollToBottomRef.current = true;
  }

  function showLatestMessageAttention(messageId?: string) {
    requestScrollToBottom("smooth");
    if (!messageId) return;
    setHighlightedMessageIds((current) => ({ ...current, [messageId]: true }));
    window.setTimeout(() => {
      setHighlightedMessageIds((current) => {
        if (!current[messageId]) return current;
        const { [messageId]: _removed, ...rest } = current;
        return rest;
      });
    }, 1600);
  }
  function shouldAutoTranslate(message: MessagePayload, targetLanguage: TranslationLanguage) {
    if (!accessTokenRef.current || message.type !== "text" || !message.body?.trim() || parseLocationMessage(message.body)) return false;
    if (message.id.startsWith("local-") && messageStatusesRef.current[message.id] === "sending") return false;
    if (message.translations?.[targetLanguage]) return false;
    if (appearsToAlreadyBeTargetLanguage(message.body, targetLanguage)) return false;
    return true;
  }
  function queueAutoTranslation(message: MessagePayload, targetLanguage: TranslationLanguage) {
    if (!shouldAutoTranslate(message, targetLanguage)) return;
    const key = translationRequestKey(message, targetLanguage);
    if (autoTranslationRequestsRef.current.has(key)) return;
    autoTranslationRequestsRef.current.add(key);
    autoTranslationQueueRef.current.push({ message, targetLanguage });
    scheduleAutoTranslationProcessing();
  }

  function queueAutoTranslations(messages: MessagePayload[], targetLanguage: TranslationLanguage) {
    for (const message of messages) queueAutoTranslation(message, targetLanguage);
    scheduleAutoTranslationProcessing();
  }

  function scheduleAutoTranslationProcessing(delay = 0) {
    if (autoTranslationTimerRef.current !== null) return;
    autoTranslationTimerRef.current = window.setTimeout(() => {
      autoTranslationTimerRef.current = null;
      processAutoTranslationQueue();
    }, delay);
  }

  function processAutoTranslationQueue() {
    const maxConcurrent = 2;
    const nextDelayMs = 450;
    while (autoTranslationActiveRef.current < maxConcurrent && autoTranslationQueueRef.current.length > 0) {
      const next = autoTranslationQueueRef.current.shift();
      if (!next) continue;
      if (!shouldAutoTranslate(next.message, next.targetLanguage)) continue;
      autoTranslationActiveRef.current += 1;
      void requestMessageTranslation(next.message, next.targetLanguage, { silent: true }).finally(() => {
        autoTranslationActiveRef.current = Math.max(autoTranslationActiveRef.current - 1, 0);
        if (autoTranslationQueueRef.current.length > 0) { window.setTimeout(processAutoTranslationQueue, nextDelayMs); }
      });
    }
    if (autoTranslationQueueRef.current.length > 0 && autoTranslationActiveRef.current < maxConcurrent) scheduleAutoTranslationProcessing(nextDelayMs);
  }

  function getManualTranslationTarget(message: MessagePayload): TranslationLanguage {
    return translationTargetLanguage;
  }

  async function requestMessageTranslation(message: MessagePayload, targetLanguage: TranslationLanguage, options: { silent?: boolean } = {}) {
    const token = accessTokenRef.current || accessToken;
    if (!token || !message.body?.trim()) return;
    setTranslationLoading((current) => ({ ...current, [message.id]: true }));
    if (!options.silent) setNotice(messageActionLabels[uiLanguage].translating);
    try {
      const data = await apiJson<{ message: MessagePayload }>(
        `/conversations/${encodeURIComponent(message.conversationId)}/messages/${encodeURIComponent(message.id)}/translate`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ targetLanguage })
        }
      );
      setMessagesByConversation((current) => ({
        ...current,
        [data.message.conversationId]: mergeMessages(current[data.message.conversationId] ?? [], [data.message])
      }));
      setTranslationErrors((current) => {
        if (!current[message.id]) return current;
        const { [message.id]: _removed, ...rest } = current;
        return rest;
      });
      if (!options.silent) setNotice(messageActionLabels[uiLanguage].translated);
    } catch (error) {
      const errorMessage = extractErrorMessage(error, messageActionLabels[uiLanguage].translateFailed);
      if (!options.silent) autoTranslationRequestsRef.current.delete(translationRequestKey(message, targetLanguage));
      setTranslationErrors((current) => ({ ...current, [message.id]: errorMessage }));
      if (!options.silent) setNotice(errorMessage);
    } finally {
      setTranslationLoading((current) => ({ ...current, [message.id]: false }));
    }
  }

  async function refreshTranslation(message: MessagePayload) {
    const targetLanguage = getManualTranslationTarget(message);
    const key = translationRequestKey(message, targetLanguage);
    const now = Date.now();
    const cooldownUntil = manualTranslationCooldownRef.current[key] ?? 0;
    if (now < cooldownUntil) {
      setNotice(messageActionLabels[uiLanguage].translationThrottled);
      return;
    }
    manualTranslationCooldownRef.current[key] = now + 3000;
    await requestMessageTranslation(message, targetLanguage);
  }
  function setReminderForMessage(message: MessagePayload) {
    const fallback = new Date(Date.now() + 60 * 60 * 1000);
    fallback.setSeconds(0, 0);
    const defaultValue = `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, "0")}-${String(fallback.getDate()).padStart(2, "0")} ${String(fallback.getHours()).padStart(2, "0")}:${String(fallback.getMinutes()).padStart(2, "0")}`;
    const input = window.prompt(uiLanguage === "zh" ? "输入提醒时间，例如 2026-07-10 18:30" : "Enter reminder time, for example 2026-07-10 18:30", defaultValue);
    if (!input) return;
    const normalized = input.trim().replace(" ", "T");
    const remindAt = new Date(normalized);
    if (Number.isNaN(remindAt.getTime()) || remindAt.getTime() <= Date.now()) {
      setNotice(uiLanguage === "zh" ? "提醒时间无效。" : "Invalid reminder time.");
      return;
    }
    if (typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "default") void window.Notification.requestPermission();
    const conversation = conversationsRef.current.find((item) => item.id === message.conversationId);
    const body = mediaPreviewLabel(message).slice(0, 180) || message.transcript || `[${message.type}]`;
    setMessageReminders((items) => [{ id: createBrowserId(), conversationId: message.conversationId, messageId: message.id, title: conversation?.name ?? message.senderName ?? "Glimpse Chat", body, remindAt: remindAt.toISOString() }, ...items]);
    setNotice(messageActionLabels[uiLanguage].reminderSet);
  }

  function startReply(message: MessagePayload) {
    setReplyingToMessage({
      id: message.id,
      senderName: message.senderName,
      type: message.type,
      body: mediaPreviewLabel(message).slice(0, 180)
    });
  }
  async function copyMessageText(message: MessagePayload) {
    const text = message.body?.trim();
    if (!text) return;
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          setNotice(messageActionLabels[uiLanguage].copied);
          return;
        } catch {
          // Fall through to the textarea copy path when browser permissions block Clipboard API.
        }
      }
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.remove();
      if (!copied) throw new Error("Copy command failed.");
      setNotice(messageActionLabels[uiLanguage].copied);
    } catch {
      setNotice(messageActionLabels[uiLanguage].copyFailed);
    }
  }

  function readMessageText(text: string | undefined, language: string, key: string) {
    const content = text?.trim();
    if (!content) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setNotice(messageActionLabels[uiLanguage].speechUnavailable);
      return;
    }
    if (speakingMessageKey === key && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      setSpeakingMessageKey("");
      return;
    }
    window.speechSynthesis.cancel();
    const selectedLanguage = speechAccent === "auto" ? language : speechAccent;
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = selectedLanguage;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((item) => item.lang.toLowerCase() === selectedLanguage.toLowerCase()) ?? voices.find((item) => item.lang.toLowerCase().startsWith(selectedLanguage.toLowerCase().slice(0, 2)));
    if (voice) utterance.voice = voice;
    utterance.onend = () => setSpeakingMessageKey((current) => (current === key ? "" : current));
    utterance.onerror = () => setSpeakingMessageKey((current) => (current === key ? "" : current));
    setSpeakingMessageKey(key);
    window.speechSynthesis.speak(utterance);
  }

  function readOriginalMessage(message: MessagePayload) {
    const fallback = message.sourceLanguage && message.sourceLanguage !== "auto" ? message.sourceLanguage : "en";
    readMessageText(message.body, inferSpeechLanguage(message.body, fallback), message.id + ":original");
  }

  function readTranslatedMessage(message: MessagePayload, translated: string, targetLanguage: TranslationLanguage) {
    readMessageText(translated, speechLanguageByTranslationLanguage[targetLanguage], message.id + ":translation:" + targetLanguage);
  }

  function resetLocationDraft() {
    setLocationName("");
    setLocationLatitude("");
    setLocationLongitude("");
  }

  function useCurrentLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setNotice(uiLanguage === "zh" ? "此浏览器不支持定位。" : "Location is not available in this browser.");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationLatitude(position.coords.latitude.toFixed(6));
        setLocationLongitude(position.coords.longitude.toFixed(6));
        if (!locationName.trim()) setLocationName(uiLanguage === "zh" ? "当前位置" : "Current location");
        setLocationLoading(false);
      },
      (error) => {
        setNotice(error.message || (uiLanguage === "zh" ? "无法获取当前位置。" : "Could not get current location."));
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function sendLocationMessage() {
    if (!currentUser || !selectedExists) return;
    const latitude = Number(locationLatitude.trim());
    const longitude = Number(locationLongitude.trim());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setNotice(uiLanguage === "zh" ? "请输入有效的经纬度。" : "Enter a valid latitude and longitude.");
      return;
    }
    const location: LocationMessagePayload = {
      latitude,
      longitude,
      name: locationName.trim() || undefined
    };
    const reply = replyingToMessage;
    const message: MessagePayload = {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text",
      body: encodeLocationMessage(location),
      ...(reply
        ? {
            replyToMessageId: reply.id,
            replyToMessageSenderName: reply.senderName,
            replyToMessageType: reply.type,
            replyToMessageBody: reply.body
          }
        : {}),
      sourceLanguage: "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date().toISOString()
    };
    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
    emitMessage(message);
    const preview = mediaPreviewLabel(message);
    setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview, time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
    setLocationModalOpen(false);
    resetLocationDraft();
    setReplyingToMessage(null);
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !currentUser || !selectedExists) return;
    const reply = replyingToMessage;
    const message: MessagePayload = {
      id: `local-${Date.now()}-${createBrowserId()}`,
      conversationId: selected.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: "text",
      body,
      ...(reply
        ? {
            replyToMessageId: reply.id,
            replyToMessageSenderName: reply.senderName,
            replyToMessageType: reply.type,
            replyToMessageBody: reply.body
          }
        : {}),
      sourceLanguage: "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date().toISOString()
    };

    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
    }));
    showLatestMessageAttention(message.id);
    setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));

    emitMessage(message);

    setConversations((items) =>
      items.map((item) => (item.id === selected.id ? { ...item, preview: body, time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item))
    );
    setDraft("");
    setReplyingToMessage(null);
  }

  function speechRecognitionLanguage() {
    if (translationTargetLanguage === "zh") return "zh-CN";
    if (translationTargetLanguage === "hi") return "hi-IN";
    return "en-US";
  }

  function stopVoiceRecognition() {
    const recognition = voiceRecognitionRef.current;
    voiceRecognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      try { recognition.stop(); } catch { undefined; }
    }
  }

  async function startVoiceRecording() {
    if (!currentUser || !selectedExists || voiceRecording || mediaUploading) return;
    setVoiceRecording(true);
    setNotice(t.voiceRecording);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceRecorderRef.current = recorder;
      setVoiceTranscriptDraft("");
      const SpeechRecognition = (window as WindowWithSpeechRecognition).SpeechRecognition ?? (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = speechRecognitionLanguage();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          const parts: string[] = [];
          for (let index = 0; index < event.results.length; index += 1) {
            const text = event.results[index]?.[0]?.transcript;
            if (text) parts.push(text.trim());
          }
          setVoiceTranscriptDraft(parts.join(" ").trim());
        };
        recognition.onend = () => {
          if (voiceRecorderRef.current?.state === "recording") {
            try { recognition.start(); } catch { undefined; }
          }
        };
        voiceRecognitionRef.current = recognition;
        try { recognition.start(); } catch { undefined; }
      }
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        prepareRecordedVoicePreview();
      };
      recorder.start();
    } catch (error) {
      setNotice(extractErrorMessage(error, t.voiceRecordFailed));
      setVoiceRecording(false);
      stopVoiceRecognition();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
      voiceStreamRef.current = null;
    }
  }

  function stopVoiceRecording() {
    const recorder = voiceRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    stopVoiceRecognition();
    recorder.stop();
    setVoiceRecording(false);
  }

  function prepareRecordedVoicePreview() {
    const chunks = voiceChunksRef.current;
    voiceChunksRef.current = [];
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    voiceRecorderRef.current = null;
    if (!chunks.length) return;
    const blob = new Blob(chunks, { type: "audio/webm" });
    const fileName = `voice-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    const file = new File([blob], fileName, { type: "audio/webm" });
    const url = URL.createObjectURL(blob);
    setPendingVoicePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return { file, url, name: fileName, transcript: voiceTranscriptDraftRef.current.trim() };
    });
    setNotice(t.voicePreviewReady);
  }

  function cancelPendingVoice() {
    setPendingVoicePreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
    setVoiceTranscriptDraft("");
  }

  async function sendPendingVoice() {
    const pending = pendingVoicePreview;
    if (!pending || !currentUser || !selectedExists) return;
    setPendingVoicePreview(null);
    setMediaUploading(true);
    setMediaUploadProgress(1);
    setNotice(`${t.uploadingMedia} 1%`);
    try {
      const media = await uploadMediaWithProgress(pending.file, accessToken, (progress) => {
        setMediaUploadProgress(progress);
        setNotice(`${t.uploadingMedia} ${progress}%`);
      });
      const reply = replyingToMessage;
      const message: MessagePayload = {
        id: `local-${Date.now()}-${createBrowserId()}`,
        conversationId: selected.id,
        senderId: currentUser.id,
        senderName: currentUser.nickname,
        type: "audio",
        body: media.fileName,
        mediaUrl: media.url,
        ...(pending.transcript ? { transcript: pending.transcript } : {}),
        ...(reply
          ? {
              replyToMessageId: reply.id,
              replyToMessageSenderName: reply.senderName,
              replyToMessageType: reply.type,
              replyToMessageBody: reply.body
            }
          : {}),
        createdAt: new Date().toISOString()
      };
      URL.revokeObjectURL(pending.url);
      setMessagesByConversation((current) => ({
        ...current,
        [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
      }));
      setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview: mediaPreviewLabel(message), time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
      setReplyingToMessage(null);
      emitMessage(message);
      requestScrollToBottom("smooth");
      setVoiceTranscriptDraft("");
    } catch (error) {
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
      setPendingVoicePreview(pending);
    } finally {
      setMediaUploading(false);
      setMediaUploadProgress(0);
    }
  }

  function clearMessageLongPressTimer() {
    if (messageLongPressTimerRef.current) {
      window.clearTimeout(messageLongPressTimerRef.current);
      messageLongPressTimerRef.current = null;
    }
  }

  function toggleSelectedMessage(messageId: string) {
    setSelectedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      if (next.size === 0) setMessageSelectMode(false);
      return next;
    });
  }

  function beginMessageSelect(messageId: string) {
    setMessageSelectMode(true);
    setSelectedMessageIds((current) => new Set(current).add(messageId));
  }

  function handleMessagePointerDown(event: ReactPointerEvent<HTMLElement>, messageId: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearMessageLongPressTimer();
    messageLongPressTriggeredRef.current = false;
    messageLongPressTimerRef.current = window.setTimeout(() => {
      messageLongPressTimerRef.current = null;
      messageLongPressTriggeredRef.current = true;
      beginMessageSelect(messageId);
    }, 520);
  }

  function cancelMessageSelection() {
    setMessageSelectMode(false);
    setSelectedMessageIds(new Set());
  }

  function selectedMessagesForCurrentConversation() {
    return currentMessages.filter((message) => selectedMessageIds.has(message.id));
  }

  function openForwardMessages(messages: MessagePayload[]) {
    const eligible = messages.filter((message) => !message.revokedAt);
    if (eligible.length === 0) return;
    setForwardMessages(eligible);
  }

  function forwardMessageToConversation(target: Conversation) {
    if (!currentUser || forwardMessages.length === 0) return;
    const now = Date.now();
    const sentMessages = forwardMessages.map((source, index): MessagePayload => ({
      id: `local-${now}-${index}-${createBrowserId()}`,
      conversationId: target.id,
      senderId: currentUser.id,
      senderName: currentUser.nickname,
      type: source.type,
      body: source.body,
      mediaUrl: source.mediaUrl,
      thumbnailUrl: source.thumbnailUrl,
      transcript: source.transcript,
      sourceLanguage: source.sourceLanguage ?? "auto",
      targetLanguage: translationTargetLanguage,
      createdAt: new Date(now + index).toISOString()
    }));
    setMessagesByConversation((current) => ({
      ...current,
      [target.id]: mergeMessages(current[target.id] ?? [], sentMessages)
    }));
    for (const message of sentMessages) emitMessage(message);
    const latest = sentMessages[sentMessages.length - 1];
    if (latest) {
      setConversations((items) => items.map((item) => item.id === target.id ? { ...item, preview: mediaPreviewLabel(latest), time: formatConversationTime(latest.createdAt), latestMessageAt: latest.createdAt } : item));
    }
    setForwardMessages([]);
    cancelMessageSelection();
    setNotice(uiLanguage === "zh" ? "消息已转发。" : "Message forwarded.");
  }

  async function copySelectedMessagesMerged() {
    const text = selectedMessagesForCurrentConversation()
      .map((message) => [
        `${message.senderName ?? message.senderId} ${formatMessageTime(message.createdAt)}`,
        mediaPreviewLabel(message)
      ].filter(Boolean).join("\n"))
      .join("\n\n");
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice(messageActionLabels[uiLanguage].copied);
    } catch {
      setNotice(messageActionLabels[uiLanguage].copyFailed);
    }
  }

  function deleteSelectedMessagesLocally() {
    if (selectedMessageIds.size === 0) return;
    setMessagesByConversation((current) => ({
      ...current,
      [selected.id]: (current[selected.id] ?? []).filter((message) => !selectedMessageIds.has(message.id))
    }));
    cancelMessageSelection();
  }

  function toggleVoiceTranscript(message: MessagePayload) {
    if (!message.transcript?.trim()) {
      setNotice(t.voiceTranscriptEmpty);
      return;
    }
    setVisibleTranscriptIds((current) => {
      const next = new Set(current);
      if (next.has(message.id)) next.delete(message.id);
      else next.add(message.id);
      return next;
    });
  }

  function revokeWindowForMessage(message: MessagePayload) {
    if (message.type === "text") return 2 * 60 * 1000;
    if (message.type === "file") return 24 * 60 * 60 * 1000;
    return 60 * 60 * 1000;
  }

  function canRevokeMessage(message: MessagePayload) {
    if (message.revokedAt || message.senderId !== currentUserIdRef.current) return false;
    const createdAt = new Date(message.createdAt).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt <= revokeWindowForMessage(message);
  }

  function revokeBatchForMessage(message: MessagePayload) {
    if (!canRevokeMessage(message) || message.type !== "text") return [];
    const createdAt = new Date(message.createdAt).getTime();
    if (!Number.isFinite(createdAt)) return [];
    return (messagesByConversation[message.conversationId] ?? [])
      .filter((item) => item.senderId === currentUserIdRef.current && item.type === "text" && !item.revokedAt)
      .filter((item) => {
        const itemTime = new Date(item.createdAt).getTime();
        return Number.isFinite(itemTime) && Math.abs(itemTime - createdAt) <= 2 * 60 * 1000 && Date.now() - itemTime <= 2 * 60 * 1000;
      })
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
  }

  function revokeMessageWithResult(message: MessagePayload) {
    return new Promise<boolean>((resolve) => {
      if (!socketRef.current?.connected) {
        resolve(false);
        return;
      }
      socketRef.current.emit("message:revoke", { conversationId: message.conversationId, messageId: message.id }, (response?: { ok?: boolean; message?: MessagePayload; error?: string }) => {
        if (response?.ok && response.message) {
          applyRevokedMessage(response.message);
          resolve(true);
          return;
        }
        resolve(false);
      });
    });
  }

  async function revokeMessageBatch(message: MessagePayload) {
    const batch = revokeBatchForMessage(message);
    if (batch.length < 2) return;
    if (!socketRef.current?.connected) {
      setNotice(t.disconnected);
      return;
    }
    const results = await Promise.all(batch.map((item) => revokeMessageWithResult(item)));
    const done = results.filter(Boolean).length;
    setNotice(done > 0 ? `${messageActionLabels[uiLanguage].revokeBatchDone} (${done})` : t.revokeFailed);
  }

  function applyRevokedMessage(message: MessagePayload) {
    setMessagesByConversation((current) => ({
      ...current,
      [message.conversationId]: mergeMessages(current[message.conversationId] ?? [], [message])
    }));
  }

  async function revokeMessage(message: MessagePayload) {
    if (!socketRef.current?.connected) {
      setNotice(t.disconnected);
      return;
    }
    const ok = await revokeMessageWithResult(message);
    setNotice(ok ? t.messageRevoked : t.revokeFailed);
  }

  function resizeDraftTextarea(element = draftTextareaRef.current) {
    if (!element) return;
    element.style.height = "44px";
    const nextHeight = Math.min(112, Math.max(44, element.scrollHeight));
    element.style.height = `${nextHeight}px`;
  }
  async function sendMediaFile(file: File) {
    if (!currentUser || !selectedExists || mediaUploading) return;
    const mediaType = mediaTypeFromFile(file);
    const maxBytes = mediaType === "image" ? MEDIA_LIMITS.imageMaxBytes : mediaType === "video" ? MEDIA_LIMITS.videoMaxBytes : mediaType === "audio" ? MEDIA_LIMITS.audioMaxBytes : MEDIA_LIMITS.fileMaxBytes;
    if (file.size > maxBytes) {
      setNotice(t.mediaTooLarge);
      return;
    }
    setMediaUploading(true);
    setFailedMediaFile(null);
    setMediaUploadProgress(1);
    setNotice(`${t.uploadingMedia} 1%`);
    try {
      const reply = replyingToMessage;
      const media = await uploadMediaWithProgress(file, accessToken, (progress) => {
        setMediaUploadProgress(progress);
        setNotice(`${t.uploadingMedia} ${progress}%`);
      });
      let thumbnailUrl: string | undefined;
      if (media.kind === "image") {
        const thumbnailFile = await createImageThumbnail(file);
        if (thumbnailFile) {
          const thumbnail = await uploadMediaWithProgress(thumbnailFile, accessToken, () => undefined);
          thumbnailUrl = thumbnail.url;
        }
      }
      const message: MessagePayload = {
        id: `local-${Date.now()}-${createBrowserId()}`,
        conversationId: selected.id,
        senderId: currentUser.id,
        senderName: currentUser.nickname,
        type: media.kind,
        body: media.fileName,
        ...(reply
          ? {
              replyToMessageId: reply.id,
              replyToMessageSenderName: reply.senderName,
              replyToMessageType: reply.type,
              replyToMessageBody: reply.body
            }
          : {}),
        mediaUrl: media.url,
        thumbnailUrl,
        createdAt: new Date().toISOString()
      };
      setMessagesByConversation((current) => ({
        ...current,
        [selected.id]: mergeMessages(current[selected.id] ?? [], [message])
      }));
      showLatestMessageAttention(message.id);
      setMessageStatuses((current) => ({ ...current, [message.id]: "sending" }));
      emitMessage(message);
      setConversations((items) => items.map((item) => (item.id === selected.id ? { ...item, preview: mediaPreviewLabel(message), time: formatConversationTime(message.createdAt), latestMessageAt: message.createdAt } : item)));
      setReplyingToMessage(null);
    } catch (error) {
      setFailedMediaFile(file);
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setMediaUploading(false);
      setMediaUploadProgress(0);
    }
  }

  function handleMediaInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void sendMediaFile(file);
  }




  async function createCroppedAvatarFile(source: string) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(t.mediaUploadFailed));
      img.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t.mediaUploadFailed);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, 512, 512);

    const viewportSize = avatarCropFrameRef.current?.clientWidth || avatarCropFrameSize || 320;
    const baseScale = Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight);
    const renderScale = baseScale * avatarCropScale;
    const cropSize = viewportSize / renderScale;
    const boundedOffset = clampAvatarCropOffset(avatarCropOffset, avatarCropScale, { width: image.naturalWidth, height: image.naturalHeight }, viewportSize);
    const centerX = image.naturalWidth / 2 - boundedOffset.x / renderScale;
    const centerY = image.naturalHeight / 2 - boundedOffset.y / renderScale;
    const sx = clampNumber(centerX - cropSize / 2, 0, Math.max(0, image.naturalWidth - cropSize));
    const sy = clampNumber(centerY - cropSize / 2, 0, Math.max(0, image.naturalHeight - cropSize));

    context.drawImage(image, sx, sy, cropSize, cropSize, 0, 0, 512, 512);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error(t.mediaUploadFailed)), "image/webp", 0.9));
    return new File([blob], "avatar.webp", { type: "image/webp" });
  }

  async function confirmAvatarCrop() {
    if (!avatarCropSource) return;
    try {
      const file = await createCroppedAvatarFile(avatarCropSource);
      const target = avatarCropTarget;
      setAvatarCropSource("");
      if (target === "group") await uploadSelectedGroupAvatar(file);
      else await handleAvatarFile(file);
    } catch (error) {
      const message = extractErrorMessage(error, t.mediaUploadFailed);
      if (avatarCropTarget === "group") setGroupError(message);
      else setNotice(message);
    }
  }

  function updateAvatarCrop(nextOffset: AvatarCropOffset, nextScale = avatarCropScale) {
    const viewportSize = avatarCropFrameRef.current?.clientWidth || avatarCropFrameSize || 320;
    const boundedScale = clampNumber(nextScale, 1, 4);
    setAvatarCropScale(boundedScale);
    setAvatarCropOffset(clampAvatarCropOffset(nextOffset, boundedScale, avatarCropImageSize, viewportSize));
  }

  function handleAvatarCropPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setAvatarCropFrameSize(event.currentTarget.clientWidth || 320);
    const gesture = avatarCropGestureRef.current;
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(gesture.pointers.values());
    gesture.lastCenter = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : { x: event.clientX, y: event.clientY };
    gesture.lastDistance = points.length >= 2 ? distanceBetweenPoints(points[0]!, points[1]!) : null;
  }

  function handleAvatarCropPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = avatarCropGestureRef.current;
    if (!gesture.pointers.has(event.pointerId)) return;
    event.preventDefault();
    gesture.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(gesture.pointers.values());
    const center = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : { x: event.clientX, y: event.clientY };
    const previousCenter = gesture.lastCenter ?? center;
    const delta = { x: center.x - previousCenter.x, y: center.y - previousCenter.y };
    let nextScale = avatarCropScale;
    if (points.length >= 2) {
      const distance = distanceBetweenPoints(points[0]!, points[1]!);
      if (gesture.lastDistance && gesture.lastDistance > 0) nextScale = clampNumber(avatarCropScale * (distance / gesture.lastDistance), 1, 4);
      gesture.lastDistance = distance;
    }
    updateAvatarCrop({ x: avatarCropOffset.x + delta.x, y: avatarCropOffset.y + delta.y }, nextScale);
    gesture.lastCenter = center;
  }

  function handleAvatarCropPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = avatarCropGestureRef.current;
    gesture.pointers.delete(event.pointerId);
    const points = Array.from(gesture.pointers.values());
    gesture.lastCenter = points.length >= 2 ? midpointBetweenPoints(points[0]!, points[1]!) : points[0] ?? null;
    gesture.lastDistance = points.length >= 2 ? distanceBetweenPoints(points[0]!, points[1]!) : null;
  }

  function handleAvatarCropWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const nextScale = clampNumber(avatarCropScale + (event.deltaY < 0 ? 0.12 : -0.12), 1, 4);
    updateAvatarCrop(avatarCropOffset, nextScale);
  }
  function showProfileNotice(message: string) {
    setProfileNotice(message);
    setNotice(message);
  }

  function validateProfilePublicId(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return uiLanguage === "zh" ? "ID 不能为空。" : "ID cannot be empty.";
    if (!/^[a-z0-9]/.test(trimmed)) return uiLanguage === "zh" ? "ID 必须以字母或数字开头。" : "ID must start with a letter or number.";
    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(trimmed)) return uiLanguage === "zh" ? "ID 需要 3-32 位，只能包含字母、数字、点、下划线或短横线。" : "ID must be 3-32 characters and only use letters, numbers, dots, underscores, or hyphens.";
    return "";
  }

  async function handleAvatarFile(file: File) {
    if (!accessToken) return;
    if (!file.type.startsWith("image/")) {
      showProfileNotice(t.mediaUnsupported);
      return;
    }
    setProfileNotice("");
    setAvatarUploading(true);
    setAvatarUploadProgress(0);
    const previewUrl = await readFileAsBase64(file);
    setProfileAvatarPreviewUrl(previewUrl);
    setProfileAvatarUrl(previewUrl);
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, setAvatarUploadProgress);
      const nextAvatarUrl = normalizeMediaUrl(uploaded.url) ?? uploaded.url;
      setProfileAvatarUrl(nextAvatarUrl);
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({
          nickname: profileNicknameValue,
          avatarUrl: nextAvatarUrl,
          company: profileCompany,
          title: profileTitle,
          location: profileLocation,
          bio: profileBio
        })
      });
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: nextAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
      setProfileEditing(false);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setAvatarUploading(false);
      setAvatarUploadProgress(0);
    }
  }

  function handleAvatarInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showProfileNotice(t.mediaUnsupported);
      return;
    }
    setProfileNotice("");
    void readFileAsBase64(file).then((source) => {
      setAvatarCropTarget("profile");
      setAvatarCropSource(source);
      setAvatarCropScale(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropImageSize({ width: 0, height: 0 });
      setAvatarCropFrameSize(320);
    });
  }

  async function handleSaveProfile(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    const publicIdError = validateProfilePublicId(profilePublicId);
    if (publicIdError) {
      showProfileNotice(publicIdError);
      return;
    }
    setProfileNotice("");
    setProfileSaving(true);
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({
          publicId: profilePublicId,
          profilePublic: profileIsPublic,
          profileEmailPublic,
          profilePhonePublic,
          nickname: profileNicknameValue,
          avatarUrl: profileAvatarUrl,
          company: profileCompany,
          title: profileTitle,
          location: profileLocation,
          bio: profileBio
        })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
      setProfileEditing(false);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    } finally {
      setProfileSaving(false);
    }
  }
  async function handleToggleProfilePublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profileIsPublic;
    setProfileIsPublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profilePublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfileIsPublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleToggleProfileEmailPublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profileEmailPublic;
    setProfileEmailPublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profileEmailPublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfileEmailPublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleToggleProfilePhonePublic(nextValue: boolean) {
    if (!accessToken) return;
    const previousValue = profilePhonePublic;
    setProfilePhonePublic(nextValue);
    setProfileNotice("");
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ profilePhonePublic: nextValue })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      void loadConversations(normalizedAuth.accessToken);
      void loadFriendData(normalizedAuth.accessToken);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      setProfilePhonePublic(previousValue);
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    }
  }

  async function handleSaveSignature() {
    if (!accessToken) return;
    setProfileNotice("");
    setProfileSignatureSaving(true);
    try {
      const auth = await apiJson<AuthResponse>("/auth/profile", accessToken, {
        method: "POST",
        body: JSON.stringify({ signature: profileSignature })
      });
      const savedAvatarUrl = normalizeMediaUrl(auth.user.avatarUrl ?? profileAvatarUrl) ?? profileAvatarUrl;
      const normalizedAuth = { ...auth, user: { ...auth.user, avatarUrl: savedAvatarUrl } };
      storeAuth(normalizedAuth);
      setAccessToken(normalizedAuth.accessToken);
      setCurrentUser(normalizedAuth.user);
      setProfileSignature(normalizedAuth.user.signature ?? "");
      setProfileSignatureEditing(false);
      showProfileNotice(t.profileSaved);
    } catch (error) {
      showProfileNotice(extractErrorMessage(error, t.profileSaveFailed));
    } finally {
      setProfileSignatureSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (!accessToken) return;
    if (changePasswordNew.length < 8) {
      setNotice(t.passwordTooShort);
      return;
    }
    if (changePasswordNew !== changePasswordConfirm) {
      setNotice(t.passwordMismatch);
      return;
    }
    setChangePasswordSaving(true);
    try {
      await apiJson<{ ok: true }>("/auth/password", accessToken, {
        method: "POST",
        body: JSON.stringify({ currentPassword: changePasswordCurrent, newPassword: changePasswordNew })
      });
      setChangePasswordCurrent("");
      setChangePasswordNew("");
      setChangePasswordConfirm("");
      setNotice(t.passwordUpdated);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.passwordChangeFailed));
    } finally {
      setChangePasswordSaving(false);
    }
  }



  async function loadAdminDashboard() {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminLoading(true);
    try {
      const [overviewData, usersData, conversationsData, feedbackData] = await Promise.all([
        apiJson<{ overview: AdminOverview }>("/admin/overview", accessToken),
        apiJson<{ users: AdminUserRow[] }>("/admin/users", accessToken),
        apiJson<{ conversations: AdminConversationRow[] }>("/admin/conversations", accessToken),
        apiJson<{ feedback: AdminFeedbackRow[] }>("/admin/feedback", accessToken)
      ]);
      setAdminOverview(overviewData.overview);
      setAdminUsers(usersData.users);
      setAdminConversations(conversationsData.conversations);
      setAdminFeedback(feedbackData.feedback);
      setAdminModalOpen(true);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminLoadFailed));
    } finally {
      setAdminLoading(false);
    }
  }

  useEffect(() => {
    if (!adminModalOpen || !accessToken || currentUser?.role !== "admin") return;
    const keyword = adminUserQuery.trim();
    const timer = window.setTimeout(() => {
      void apiJson<{ users: AdminUserRow[] }>(`/admin/users${keyword ? `?query=${encodeURIComponent(keyword)}` : ""}`, accessToken)
        .then((data) => setAdminUsers(data.users))
        .catch((error) => setNotice(extractErrorMessage(error, t.adminLoadFailed)));
    }, 300);
    return () => window.clearTimeout(timer);
  }, [adminModalOpen, adminUserQuery, accessToken, currentUser?.role, t.adminLoadFailed]);
  async function loadAdminUserChats(user: AdminUserRow) {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminUserChatsLoadingId(user.id);
    try {
      const data = await apiJson<AdminUserChats>(`/admin/users/${user.id}/chats`, accessToken);
      setAdminSelectedUserChats(data);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminLoadUserChatsFailed));
    } finally {
      setAdminUserChatsLoadingId("");
    }
  }
  async function setAdminUserDisabled(user: AdminUserRow, disabled: boolean) {
    if (!accessToken || currentUser?.role !== "admin" || user.id === currentUser.id) return;
    setAdminActionUserId(user.id);
    try {
      const data = await apiJson<{ user: AdminUserRow }>(`/admin/users/${user.id}/${disabled ? "disable" : "enable"}`, accessToken, { method: "POST" });
      setAdminUsers((items) => items.map((item) => (item.id === user.id ? data.user : item)));
      setAdminOverview((overview) => overview ? { ...overview, disabledUsers: Math.max(0, overview.disabledUsers + (disabled ? 1 : -1)) } : overview);
      setNotice(disabled ? t.adminUserDisabled : t.adminUserEnabled);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminUserActionFailed));
    } finally {
      setAdminActionUserId("");
    }
  }
  async function resetAdminUserPassword(user: AdminUserRow) {
    if (!accessToken || currentUser?.role !== "admin" || user.id === currentUser.id) return;
    setAdminActionUserId(user.id);
    try {
      const data = await apiJson<{ user: AdminUserRow; temporaryPassword: string }>(`/admin/users/${user.id}/reset-password`, accessToken, { method: "POST" });
      setAdminPasswordReset(data);
      setNotice(t.adminPasswordResetDone);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminPasswordResetFailed));
    } finally {
      setAdminActionUserId("");
    }
  }
  async function updateAdminFeedbackStatus(feedback: AdminFeedbackRow, status: string) {
    if (!accessToken || currentUser?.role !== "admin") return;
    setAdminFeedbackActionId(feedback.id);
    try {
      const data = await apiJson<{ feedback: AdminFeedbackRow }>(`/admin/feedback/${feedback.id}/status`, accessToken, {
        method: "POST",
        body: JSON.stringify({ status })
      });
      setAdminFeedback((items) => items.map((item) => (item.id === feedback.id ? data.feedback : item)));
      setNotice(t.adminFeedbackUpdated);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.adminFeedbackUpdateFailed));
    } finally {
      setAdminFeedbackActionId("");
    }
  }
  async function sendFeedbackAttachment(file: File) {
    if (!accessToken) return;
    if (!file.type.startsWith("image/")) {
      setNotice(t.mediaUnsupported);
      return;
    }
    setFeedbackAttachmentUploading(true);
    setFeedbackAttachmentProgress(0);
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, setFeedbackAttachmentProgress);
      setFeedbackAttachment(uploaded);
      setNotice(t.feedbackAttachmentReady);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setFeedbackAttachmentUploading(false);
      setFeedbackAttachmentProgress(0);
    }
  }

  function handleFeedbackAttachmentChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void sendFeedbackAttachment(file);
  }
  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    const message = feedbackMessage.trim();
    if (message.length < 5) {
      setNotice(t.feedbackTooShort);
      return;
    }
    setFeedbackSaving(true);
    try {
      await apiJson<{ feedback: { id: string } }>("/feedback", accessToken, {
        method: "POST",
        body: JSON.stringify({ category: "general", message, attachmentUrl: feedbackAttachment?.url })
      });
      setFeedbackMessage("");
      setNotice(t.feedbackSent);
    } catch (error) {
      setNotice(extractErrorMessage(error, t.feedbackFailed));
    } finally {
      setFeedbackSaving(false);
    }
  }
  async function sendVerificationCode() {
    const email = authEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) {
      setAuthError("Please enter a valid email address.");
      return;
    }
    setAuthError("");
    setAuthCodeSending(true);
    try {
      const response = await fetchWithTimeout(`${getApiUrl()}/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      const data = (await response.json()) as unknown;
      if (!response.ok) {
        const maybeMessage = typeof data === "object" && data !== null && "message" in data ? (data as { message?: string | string[] }).message : undefined;
        const message = Array.isArray(maybeMessage) ? maybeMessage.join("; ") : maybeMessage;
        throw new Error(message || "Failed to send verification code.");
      }
      setAuthCodeSent(true);
      setAuthCodeCountdown(60);
      const timer = setInterval(() => {
        setAuthCodeCountdown((prev) => {
          if (prev <= 1) { clearInterval(timer); return 0; }
          return prev - 1;
        });
      }, 1000);
    } catch (error) {
      setAuthError(extractErrorMessage(error, "Failed to send verification code."));
    } finally {
      setAuthCodeSending(false);
    }
  }

  async function submitAuth(event: FormEvent) {
    event.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
      const response = await fetchWithTimeout(`${getApiUrl()}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          authMode === "login"
            ? { email: authEmail.trim().toLowerCase(), password: authPassword }
            : { email: authEmail.trim().toLowerCase(), password: authPassword, nickname: authNickname.trim(), language: uiLanguage, code: authCode.trim() }
        )
      });
      const data = (await response.json()) as unknown;
      if (!response.ok || typeof data !== "object" || data === null || !("accessToken" in data)) {
        const maybeMessage = typeof data === "object" && data !== null && "message" in data ? (data as { message?: string | string[] }).message : undefined;
        const message = Array.isArray(maybeMessage) ? maybeMessage.join("; ") : maybeMessage;
        throw new Error(message || t.authFailed);
      }
      const auth = data as AuthResponse;
      storeAuth(auth);
      setAccessToken(auth.accessToken);
      setCurrentUser(auth.user);
      await loadConversations(auth.accessToken);
    } catch (error) {
      setAuthError(extractErrorMessage(error, t.authFailed));
    } finally {
      setAuthLoading(false);
    }
  }

  function logout() {
    endActiveCall(false);
    clearStoredAuth();
    socketRef.current?.disconnect();
    socketRef.current = null;
    setAccessToken("");
    setCurrentUser(null);
    setIsConnected(false);
    setConnectionState("offline");
  }



  function openGroupDetails(groupOverride?: Conversation) {
    const group = groupOverride ?? selected;
    if (group.type !== "group") return;
    setGroupDetailsConversation(group);
    setGroupDetailsOpen(true);
    setGroupTitleEditValue(group.name);
    setGroupAnnouncementValue(group.announcement ?? "");
    setGroupAnnouncementScrollValue(group.announcementScroll !== false);
    setGroupInviteSelectedIds([]);
    setGroupError("");
    void loadGroupMembers(group.id);
  }

  function normalizeGroupMembers(members: GroupMemberSummary[]) {
    return members.map((member) => ({
      ...member,
      user: { ...member.user, avatarUrl: normalizeMediaUrl(member.user.avatarUrl ?? undefined) },
      invitedBy: member.invitedBy ? { ...member.invitedBy, avatarUrl: normalizeMediaUrl(member.invitedBy.avatarUrl ?? undefined) } : member.invitedBy
    }));
  }

  async function loadGroupMembers(conversationId: string) {
    setGroupMembersLoading(true);
    try {
      const data = await apiJson<{ members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(conversationId)}/members`, accessToken);
      setGroupMembers(normalizeGroupMembers(data.members));
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.requestFailed));
    } finally {
      setGroupMembersLoading(false);
    }
  }

  function toggleInviteMember(userId: string) {
    setGroupError("");
    setGroupInviteSelectedIds((current) => current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]);
  }

  async function inviteMembersToSelectedGroup() {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group" || groupInviteSaving) return;
    if (groupInviteSelectedIds.length < 1) {
      setGroupError(t.groupNoInviteCandidates);
      return;
    }
    setGroupInviteSaving(true);
    setGroupError("");
    try {
      const data = await apiJson<{ conversation: ConversationSummary; members: GroupMemberSummary[] }>(`/conversations/${encodeURIComponent(group.id)}/members`, accessToken, {
        method: "POST",
        body: JSON.stringify({ userIds: groupInviteSelectedIds })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => items.map((item) => item.id === mapped.id ? { ...item, ...mapped } : item));
      setGroupDetailsConversation((current) => current?.id === mapped.id ? { ...current, ...mapped } : mapped);
      setGroupMembers(normalizeGroupMembers(data.members));
      setGroupInviteSelectedIds([]);
      setNotice(t.groupInviteSuccess);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.groupInviteFailed));
    } finally {
      setGroupInviteSaving(false);
    }
  }

  async function saveSelectedGroupSettings(nextAvatarUrl?: string) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    setGroupError("");
    try {
      const data = await apiJson<{ conversation: ConversationSummary }>(`/conversations/${encodeURIComponent(group.id)}/group-profile`, accessToken, {
        method: "PATCH",
        body: JSON.stringify({ title: groupTitleEditValue, announcement: groupAnnouncementValue, announcementScroll: groupAnnouncementScrollValue, ...(nextAvatarUrl !== undefined ? { avatarUrl: nextAvatarUrl } : {}) })
      });
      const mapped = mapConversation(data.conversation);
      setConversations((items) => items.map((item) => item.id === mapped.id ? { ...item, ...mapped } : item));
      setGroupDetailsConversation((current) => current?.id === mapped.id ? { ...current, ...mapped } : mapped);
      setGroupTitleEditValue(mapped.name);
      setGroupAnnouncementValue(mapped.announcement ?? "");
      setGroupAnnouncementScrollValue(mapped.announcementScroll !== false);
      setNotice(t.groupSettingsSaved);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.requestFailed));
    }
  }

  async function uploadSelectedGroupAvatar(file: File) {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    if (!file.type.startsWith("image/")) {
      setGroupError(t.mediaUnsupported);
      return;
    }
    setGroupAvatarUploading(true);
    setGroupError("");
    try {
      const uploaded = await uploadMediaWithProgress(file, accessToken, () => undefined);
      await saveSelectedGroupSettings(uploaded.url);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.mediaUploadFailed));
    } finally {
      setGroupAvatarUploading(false);
    }
  }

  function handleGroupAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setGroupError(t.mediaUnsupported);
      return;
    }
    void readFileAsBase64(file).then((source) => {
      setAvatarCropTarget("group");
      setAvatarCropSource(source);
      setAvatarCropScale(1);
      setAvatarCropOffset({ x: 0, y: 0 });
      setAvatarCropImageSize({ width: 0, height: 0 });
      setAvatarCropFrameSize(320);
      setGroupError("");
    });
  }

  async function dissolveSelectedGroup() {
    const group = groupDetailsConversation ?? selected;
    if (group.type !== "group") return;
    if (!window.confirm(t.groupDissolveConfirm)) return;
    try {
      await apiJson<{ ok: true }>(`/conversations/${encodeURIComponent(group.id)}/group`, accessToken, { method: "DELETE" });
      setConversations((items) => items.filter((item) => item.id !== group.id));
      setGroupDetailsOpen(false);
      setGroupDetailsConversation(null);
      setGroupMembers([]);
      setSelectedId(conversations.find((item) => item.id !== group.id)?.id ?? defaultConversation.id);
      setNotice(t.groupDissolved);
    } catch (error) {
      setGroupError(extractErrorMessage(error, t.requestFailed));
    }
  }
  async function copyContactShortcut(user: SearchUser) {
    const conversation = conversationsRef.current.find((item) => item.type === "single" && item.otherUser?.id === user.id);
    if (!conversation) {
      setNotice(t.shortcutUnavailable);
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", conversation.id);
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice(t.shortcutCopied);
    } catch {
      setNotice(url.toString());
    }
  }

  function openSelectedDetails() {
    if (selected.type === "group") {
      openGroupDetails();
      return;
    }
    if (selectedContactUser) setContactDetailsUser(selectedContactUser);
  }

  function openConversationAvatarDetails(conversation: Conversation, event?: React.MouseEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    if (conversation.type === "group") {
      openGroupDetails(conversation);
      return;
    }
    if (conversation.otherUser) setContactDetailsUser(conversation.otherUser as SearchUser);
  }

  function openUserDetails(user?: (PublicUser & { email?: string | null; phone?: string | null }) | null) {
    if (!user) return;
    setContactDetailsUser(user as SearchUser);
  }

  function renderContactDetails(user: SearchUser) {
    const isSelfContact = user.id === currentUser?.id;
    const fields = user.profilePublic === false ? [] : [
      [t.profileEmail, user.email],
      [t.profilePhone, user.phone],
      [t.profileCompany, user.company],
      [t.profileTitle, user.title],
      [t.profileLocation, user.location],
      [t.profileSignature, user.signature],
      [t.profileBio, user.bio]
    ].filter(([, value]) => typeof value === "string" && value.trim());
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => setContactDetailsUser(null)}>
        <div className="mx-auto mt-16 w-full max-w-md rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-base font-semibold text-ink">{t.contactDetailsTitle}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setContactDetailsUser(null)} type="button">{t.adminClose}</button>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="shrink-0" onClick={() => user.avatarUrl ? setPreviewMedia({ url: normalizeMediaUrl(user.avatarUrl) ?? user.avatarUrl, type: "avatar", name: user.nickname }) : null} type="button" aria-label={t.mediaOpen}>
              <Avatar name={user.nickname} url={user.avatarUrl} size="lg" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-ink">{user.nickname}</p>
              <p className="truncate text-sm text-slate-500">{user.publicId ? `ID: ${user.publicId}` : user.email ?? user.phone ?? user.id}</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {fields.length === 0 ? <p className="rounded border border-line bg-paper px-3 py-3 text-slate-500">{t.contactDetailsEmpty}</p> : null}
            {fields.map(([label, value]) => (
              <div key={label} className="rounded border border-line px-3 py-2">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 whitespace-pre-wrap text-ink">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-2">
            <button className="flex items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand sm:col-span-2" onClick={() => { setContactDetailsUser(null); setMediaLibraryOpen(true); }} type="button"><FileText size={15} />{t.mediaFiles}</button>
            {!isSelfContact ? (() => { const blocked = blockedUsers.some((block) => block.user.id === user.id); return <button aria-pressed={blocked} className="flex w-full items-center justify-between gap-3 rounded border border-line px-3 py-2 text-left hover:border-brand sm:col-span-2" onClick={() => blocked ? void unblockUser(user) : void blockUser(user)} type="button"><span><span className="block font-medium text-ink">{t.blockUser}</span><span className="block text-xs text-slate-500">{blocked ? t.unblockUser : t.blockUser}</span></span><BlockToggle checked={blocked} /></button>; })() : null}
            {!isSelfContact ? <div className="rounded border border-line bg-paper px-3 py-2 text-xs text-slate-500 sm:col-span-2">
              <label className="flex items-center gap-2"><input className="h-4 w-4 accent-brand" type="checkbox" checked={removeContactClearHistory} onChange={(event) => setRemoveContactClearHistory(event.target.checked)} />{uiLanguage === "zh" ? "同时清空聊天记录" : "Also clear chat history"}</label>
              <p className="mt-1">{uiLanguage === "zh" ? "默认不勾选，删除联系人后仍保留聊天记录便于以后找回。" : "Unchecked by default. Removing a contact keeps chat history available for later recovery."}</p>
            </div> : null}
            {!isSelfContact ? <button className="flex items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand sm:col-span-2" onClick={() => void copyContactShortcut(user)} type="button"><Copy size={15} />{t.copyShortcut}</button> : null}
            {!isSelfContact ? <button className="rounded border border-coral px-3 py-2 text-left text-sm font-medium text-coral hover:bg-coral/10 sm:col-span-2" onClick={() => void removeFriend(user, removeContactClearHistory)} type="button">{t.removeFriend}</button> : null}
          </div>
        </div>
      </div>
    );
  }


  function renderGroupDetails() {
    const group = groupDetailsConversation ?? (selected.type === "group" ? selected : null);
    if (!groupDetailsOpen || !group) return null;
    const owner = group.ownerId === currentUser?.id || groupMembers.some((member) => member.user.id === currentUser?.id && member.isOwner);
    const currentMemberIds = new Set(groupMembers.map((member) => member.user.id));
    const inviteCandidates = groupCandidateUsers.filter((user) => !currentMemberIds.has(user.id));
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => { setGroupDetailsOpen(false); setGroupDetailsConversation(null); }}>
        <div className="mx-auto mt-6 flex max-h-[92vh] w-full max-w-2xl flex-col rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-base font-semibold text-ink">{t.groupDetailsTitle}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => { setGroupDetailsOpen(false); setGroupDetailsConversation(null); }} type="button">{t.adminClose}</button>
          </div>
          <div className="min-h-0 overflow-auto py-4">
            <div className="flex items-center gap-3">
              <button className="shrink-0" onClick={() => group.avatarUrl ? setPreviewMedia({ url: normalizeMediaUrl(group.avatarUrl) ?? group.avatarUrl, type: "avatar", name: group.name }) : null} type="button" aria-label={t.mediaOpen}>
                <Avatar name={group.name} url={group.avatarUrl} size="lg" kind="group" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-lg font-semibold text-ink">{group.name}</p>
                <p className="text-sm text-slate-500">{group.memberCount ?? groupMembers.length} {t.groupMembers}</p>
              </div>
              {owner ? (
                <>
                  <input ref={groupAvatarInputRef} className="hidden" type="file" accept="image/*" onChange={handleGroupAvatarChange} />
                  <button className="rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-60" disabled={groupAvatarUploading} onClick={() => groupAvatarInputRef.current?.click()} type="button">{groupAvatarUploading ? "..." : t.groupAvatar}</button>
                </>
              ) : null}
            </div>
            <button className="mt-4 flex w-full items-center justify-center gap-2 rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand" onClick={() => { setGroupDetailsOpen(false); setGroupDetailsConversation(null); setMediaLibraryOpen(true); }} type="button"><FileText size={15} />{t.mediaFiles}</button>
            {group.announcement ? <p className="mt-4 whitespace-pre-wrap rounded border border-line bg-paper px-3 py-3 text-sm text-ink">{group.announcement}</p> : null}
            {owner ? (
              <div className="mt-4 space-y-3 rounded border border-line p-3">
                <label className="block text-sm font-medium text-ink">{t.groupTitle}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={80} value={groupTitleEditValue} onChange={(event) => setGroupTitleEditValue(event.target.value)} /></label>
                <label className="block text-sm font-medium text-ink">{t.groupAnnouncement}<textarea className="mt-1 min-h-24 w-full resize-y rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand" maxLength={1000} value={groupAnnouncementValue} onChange={(event) => setGroupAnnouncementValue(event.target.value)} /></label>
                <label className="flex items-center gap-3 text-sm font-medium text-ink"><input className="h-4 w-4 accent-brand" type="checkbox" checked={groupAnnouncementScrollValue} onChange={(event) => setGroupAnnouncementScrollValue(event.target.checked)} /><span>{t.groupAnnouncementScroll}</span></label>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-teal-800" onClick={() => void saveSelectedGroupSettings()} type="button">{t.groupSaveSettings}</button>
                  <button className="rounded border border-coral px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10" onClick={() => void dissolveSelectedGroup()} type="button">{t.groupDissolve}</button>
                </div>
              </div>
            ) : null}
            <div className="mt-4 rounded border border-line">
              <div className="border-b border-line px-3 py-2 text-sm font-semibold text-ink">{t.groupMembersList}</div>
              {groupMembersLoading ? <p className="px-3 py-3 text-sm text-slate-500">{t.searching}</p> : null}
              {groupMembers.map((member) => <div key={member.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-b-0"><button className="shrink-0" onClick={() => openUserDetails(member.user)} type="button" aria-label={t.viewContactDetails}><Avatar name={member.user.nickname} url={member.user.avatarUrl} size="sm" /></button><div className="min-w-0 flex-1"><button className="block max-w-full truncate text-left text-sm font-medium text-ink hover:text-brand" onClick={() => openUserDetails(member.user)} type="button">{member.user.nickname} {member.isOwner ? `(${t.groupOwner})` : ""}</button><p className="truncate text-xs text-slate-500">{member.invitedBy ? `${t.groupInvitedBy}: ${member.invitedBy.nickname}` : ""}</p></div></div>)}
            </div>
            <div className="mt-4 rounded border border-line p-3">
              <p className="text-sm font-semibold text-ink">{t.groupInviteMembers}</p><p className="mt-1 text-xs text-slate-500">{t.groupInviteHint}</p>
              <div className="mt-3 max-h-56 overflow-auto rounded border border-line">
                {inviteCandidates.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">{t.groupNoInviteCandidates}</p> : null}
                {inviteCandidates.map((user) => { const checked = groupInviteSelectedIds.includes(user.id); return <label key={user.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-paper"><input className="h-4 w-4 accent-brand" type="checkbox" checked={checked} onChange={() => toggleInviteMember(user.id)} /><button className="shrink-0" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openUserDetails(user); }} type="button" aria-label={t.viewContactDetails}><Avatar name={user.nickname} url={user.avatarUrl} size="sm" /></button><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{user.nickname}</span><span className="block truncate text-xs text-slate-500">{user.email ?? user.phone ?? user.id}</span></span></label>; })}
              </div>
              <button className="mt-3 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={groupInviteSaving || groupInviteSelectedIds.length < 1} onClick={() => void inviteMembersToSelectedGroup()} type="button">{groupInviteSaving ? "..." : t.groupInviteMembers}</button>
            </div>
            {groupError ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{groupError}</p> : null}
          </div>
        </div>
      </div>
    );
  }
  function renderGroupModal() {
    if (!groupModalOpen) return null;
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => setGroupModalOpen(false)}>
        <div className="mx-auto mt-10 w-full max-w-md rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <p className="text-base font-semibold text-ink">{t.createGroup}</p>
            <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setGroupModalOpen(false)} type="button">{t.adminClose}</button>
          </div>
          <label className="mt-4 block text-sm font-medium text-ink">
            {t.groupTitle}
            <input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={80} value={groupTitleValue} onChange={(event) => setGroupTitleValue(event.target.value)} />
          </label>
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">{t.groupMembers}</p>
            <p className="mt-1 text-xs text-slate-500">{t.groupCreateHint}</p>
            <div className="mt-3 max-h-72 overflow-auto rounded border border-line">
              {groupCandidateUsers.length === 0 ? <p className="px-3 py-4 text-sm text-slate-500">{t.groupNoFriends}</p> : null}
              {groupCandidateUsers.map((friend) => {
                const checked = groupSelectedIds.includes(friend.id);
                return (
                  <label key={friend.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-paper">
                    <input className="h-4 w-4 accent-brand" type="checkbox" checked={checked} onChange={() => toggleGroupMember(friend.id)} />
                    <Avatar name={friend.nickname} url={friend.avatarUrl} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{friend.nickname}</span>
                      <span className="block truncate text-xs text-slate-500">{friend.email ?? friend.phone ?? friend.id}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {groupError ? <p className="mt-3 rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{groupError}</p> : null}
          <button className="mt-4 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={groupCreating} onClick={() => void createGroupConversation()} type="button">
            {groupCreating ? "..." : t.createGroup}
          </button>
        </div>
      </div>
    );
  }
  if (!currentUser) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f5] px-4">
        <section className="w-full max-w-sm rounded border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <img className="h-12 w-12 rounded object-contain" src="/glimpse-logo.png" alt="Glimpse Chat" />
            <div>
              <h1 className="text-2xl font-semibold text-ink">Glimpse Chat</h1>
              <p className="mt-1 text-sm text-slate-500">Sign in to your chat workspace.</p>
            </div>
          </div>
          <form className="mt-5 space-y-3" onSubmit={submitAuth}>
            <div className="grid grid-cols-2 rounded border border-line p-1 text-sm">
              <button type="button" className={`rounded px-3 py-2 ${authMode === "login" ? "bg-brand text-white" : "text-slate-600"}`} onClick={() => setAuthMode("login")}>Login</button>
              <button type="button" className={`rounded px-3 py-2 ${authMode === "register" ? "bg-brand text-white" : "text-slate-600"}`} onClick={() => setAuthMode("register")}>Register</button>
            </div>
            {authMode === "register" ? (
              <label className="block text-sm font-medium text-ink">
                Nickname
                <input className="mt-1 h-11 w-full rounded border border-line px-3 outline-none focus:border-brand" autoComplete="nickname" value={authNickname} onChange={(event) => setAuthNickname(event.target.value)} />
              </label>
            ) : null}
            <label className="block text-sm font-medium text-ink">
              Email
              <input className="mt-1 h-11 w-full rounded border border-line px-3 outline-none focus:border-brand" autoComplete="email" type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} />
            </label>
            {authMode === "register" ? (
              <label className="block text-sm font-medium text-ink">
                Verification code
                <div className="mt-1 flex gap-2">
                  <input
                    className="h-11 w-full rounded border border-line px-3 outline-none focus:border-brand"
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    maxLength={6}
                    value={authCode}
                    onChange={(event) => setAuthCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <button
                    type="button"
                    className="h-11 shrink-0 rounded border border-line px-3 text-sm text-slate-600 hover:border-brand hover:text-brand disabled:opacity-50"
                    disabled={authCodeSending || authCodeCountdown > 0}
                    onClick={() => void sendVerificationCode()}
                  >
                    {authCodeSending ? "Sending..." : authCodeCountdown > 0 ? `Resend (${authCodeCountdown}s)` : authCodeSent ? "Resend" : "Send code"}
                  </button>
                </div>
                {authCodeSent ? <p className="mt-1 text-xs text-teal-700">Verification code has been sent to your email.</p> : null}
              </label>
            ) : null}
            <label className="block text-sm font-medium text-ink">
              Password
              <input className="mt-1 h-11 w-full rounded border border-line px-3 outline-none focus:border-brand" autoComplete={authMode === "login" ? "current-password" : "new-password"} type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} />
            </label>
            {authError ? <p className="rounded border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">{authError}</p> : null}
            <button className="h-11 w-full rounded bg-brand font-medium text-white hover:bg-teal-800" disabled={authLoading} type="submit">
              {authLoading ? "Please wait..." : authMode === "login" ? "Login" : "Create account"}
            </button>
          </form>
        </section>
      </main>
    );
  }
  return (
    <main className="h-[100dvh] overflow-hidden bg-paper">
      <style>{`@keyframes glimpse-group-announcement-marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl flex-col lg:flex-row">
        <aside className={`border-line ${mobilePane === "chat" ? "hidden lg:flex" : "flex"} max-h-[100dvh] w-full shrink-0 flex-col overflow-hidden border-b bg-white lg:max-h-none lg:min-h-0 lg:w-[360px] lg:border-b-0 lg:border-r`}>
          <header className="border-line flex h-16 items-center justify-between border-b px-4">
            <div>
              <button className="flex items-center gap-2 text-left select-none" onClick={handleTitleClick} onDoubleClick={(event) => { event.preventDefault(); jumpToLatestUnreadOrBottom(); }} type="button" title={uiLanguage === "zh" ? "双击定位未读消息" : "Double click to locate unread messages"}><h1 className="text-xl font-semibold text-ink">Glimpse Chat</h1><OnlineDot online={ownOnline} size="md" /></button>
              <p className="text-xs text-slate-500">{t.subtitle}</p>
            </div>
            <div className="flex gap-2">
              <button aria-label="Switch language" className="grid h-10 w-10 place-items-center rounded border border-line text-ink hover:border-brand hover:text-brand" onClick={() => setUiLanguage((value) => (value === "zh" ? "en" : "zh"))} title="Switch language">
                <Languages size={18} />
              </button>
              <button aria-label={t.settings} className="grid h-10 w-10 place-items-center rounded border border-line text-ink hover:border-brand hover:text-brand" onClick={() => setSettingsOpen((value) => !value)} title={t.settings}>
                <Settings size={18} />
              </button>
            </div>
          </header>

          {settingsOpen ? (
            <div className="border-line border-b bg-white px-4 py-3">
              <label className="block text-xs font-medium text-slate-500">
                {t.translationTarget}
                <select className="mt-1 h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" value={translationTargetLanguage} onChange={(event) => setTranslationTargetLanguage(event.target.value as TranslationLanguage)}>
                  {TRANSLATION_LANGUAGE_OPTIONS.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.label} / {item.nativeLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-500">
                {t.displayMode}
                <select className="mt-1 h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" value={messageDisplayMode} onChange={(event) => setMessageDisplayMode(event.target.value as MessageDisplayMode)}>
                  <option value="original">{t.originalOnly}</option>
                  <option value="translated">{t.translatedOnly}</option>
                  <option value="bilingual">{t.bilingual}</option>
                </select>
              </label>
              <label className="mt-3 block text-xs font-medium text-slate-500">
                {t.speechAccent}
                <select className="mt-1 h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" value={speechAccent} onChange={(event) => setSpeechAccent(event.target.value as SpeechAccent)}>
                  {speechAccentOptions.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code === "auto" ? t.speechAccentAuto : item.label}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-4 space-y-2 rounded border border-line bg-paper px-3 py-3">
                <label className="flex items-start gap-3 text-sm text-ink">
                  <input className="mt-1 h-4 w-4 accent-brand" type="checkbox" checked={notificationsEnabled} onChange={(event) => updateNotificationsEnabled(event.target.checked)} />
                  <span>
                    <span className="block font-medium">{t.notifications}</span>
                    <span className="block text-xs text-slate-500">{t.notificationsHint}</span>
                  </span>
                </label>
                <label className="flex items-center gap-3 text-sm text-ink">
                  <input className="h-4 w-4 accent-brand" type="checkbox" checked={notificationSoundEnabled} disabled={!notificationsEnabled} onChange={(event) => setNotificationSoundEnabled(event.target.checked)} />
                  <span>{t.notificationSound}</span>
                </label>
                <label className="flex items-center gap-3 text-sm text-ink">
                  <input className="h-4 w-4 accent-brand" type="checkbox" checked={notificationVibrationEnabled} disabled={!notificationsEnabled} onChange={(event) => setNotificationVibrationEnabled(event.target.checked)} />
                  <span>{t.notificationVibration}</span>
                </label>
                <p className="text-xs text-slate-500">{t.notificationPermission}</p>
              </div>
              <div className="mt-4 rounded border border-line bg-paper px-3 py-3 text-xs text-slate-500" data-settings-version-row="true">
                <span className="font-medium text-ink">{t.versionLabel}</span>: {GLIMPSE_CHAT_VERSION}
              </div>
              <form className="mt-4 space-y-2 rounded border border-line bg-paper px-3 py-3" onSubmit={handleChangePassword}>
                <p className="text-sm font-medium text-ink">{t.changePasswordTitle}</p>
                <input className="h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="current-password" placeholder={t.currentPassword} value={changePasswordCurrent} onChange={(event) => setChangePasswordCurrent(event.target.value)} />
                <input className="h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="new-password" placeholder={t.newPassword} value={changePasswordNew} onChange={(event) => setChangePasswordNew(event.target.value)} />
                <input className="h-10 w-full rounded border border-line bg-white px-3 text-sm text-ink outline-none focus:border-brand" type="password" autoComplete="new-password" placeholder={t.confirmPassword} value={changePasswordConfirm} onChange={(event) => setChangePasswordConfirm(event.target.value)} />
                <button className="h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={changePasswordSaving || !changePasswordCurrent || !changePasswordNew || !changePasswordConfirm} type="submit">
                  {changePasswordSaving ? "..." : t.updatePassword}
                </button>
              </form>
            </div>
          ) : null}
          <div className="border-line border-b p-3">
            <label className="flex h-11 items-center gap-2 rounded border border-line bg-paper px-3 text-sm text-slate-500">
              <Search size={18} />
              <input className="w-full bg-transparent text-ink outline-none" placeholder={t.search} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
          </div>

          <nav className="border-line grid grid-cols-3 border-b text-sm">
            <TabButton active={tab === "chats"} onClick={() => setTab("chats")} onDoubleClick={jumpToLatestUnreadOrBottom} icon={<MessageCircle size={17} />} label={t.chats} />
            <TabButton active={tab === "contacts"} onClick={() => setTab("contacts")} icon={<Users size={17} />} label={t.contacts} />
            <TabButton active={tab === "me"} onClick={() => setTab("me")} icon={<Globe2 size={17} />} label={t.me} />
          </nav>

          <section className="min-h-0 flex-1 overflow-auto">
            {notice && (tab !== "me" || !profileNotice) ? <div className="glimpse-notice-fade border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="status">{localizeNoticeMessage(notice, uiLanguage)}</div> : null}
            {tab === "chats" ? (
              conversationsLoading && conversations.length === 0 ? (
                <p className="px-4 py-6 text-sm text-slate-500">{t.loadingConversations}</p>
              ) : conversationsFailed && conversations.length === 0 ? (
                <div className="space-y-3 px-4 py-6 text-sm text-slate-500">
                  <p>{t.conversationsFailed}</p>
                  <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand" onClick={() => void loadConversations()} type="button">
                    {messageActionLabels[uiLanguage].retry}
                  </button>
                </div>
              ) : filtered.length > 0 ? (
                filtered.map((item) => (
                  <button key={item.id} className={`border-line flex w-full items-center gap-3 border-b px-4 py-3 text-left hover:bg-paper ${item.id === selected.id ? "bg-paper" : ""}`} onClick={(event) => { if (conversationLongPressTriggeredRef.current) { event.preventDefault(); conversationLongPressTriggeredRef.current = false; return; } selectConversation(item.id); }} onContextMenu={(event) => handleConversationContextMenu(event, item.id)} onPointerDown={(event) => handleConversationPointerDown(event, item.id)} onPointerUp={clearConversationLongPressTimer} onPointerLeave={clearConversationLongPressTimer} onPointerCancel={clearConversationLongPressTimer}>
                    <span className="relative shrink-0" role="button" tabIndex={0} onClick={(event) => openConversationAvatarDetails(item, event)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openConversationAvatarDetails(item, event as unknown as React.MouseEvent); }}><Avatar name={item.name} url={item.avatarUrl} kind={item.type === "group" ? "group" : "user"} />{item.type === "single" ? <OnlineDot online={Boolean(item.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /> : null}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-medium text-ink">{pinnedConversationIds.has(item.id) ? "[Top] " : ""}{item.name}</p>
                        <span className="shrink-0 text-xs text-slate-500">{item.time}</span>
                      </div>
                      <p className="truncate text-sm text-slate-500">{item.preview}</p>
                    </div>
                    {item.unread > 0 ? <UnreadBadge count={item.unread} /> : null}
                  </button>
                ))
              ) : (
                <p className="px-4 py-6 text-sm text-slate-500">{conversations.length === 0 ? t.noConversations : t.empty}</p>
              )
            ) : null}

            {tab === "contacts" ? (
              <div className="divide-y divide-line">
                <div className="space-y-3 px-4 py-3 text-sm text-slate-500">
                  <p>{t.contactHint}</p>
                  <button className="inline-flex h-10 items-center gap-2 rounded bg-brand px-3 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" onClick={() => { setNotice(""); setGroupError(""); setGroupModalOpen(true); }} type="button">
                    <Users size={16} />{t.createGroup}
                  </button>
                </div>
                {query.trim().length < 2 && blockedUsers.length > 0 ? (
                  <div className="px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t.blockedUsersTitle}</p>
                    <div className="space-y-1">
                      {blockedUsers.map((block) => (
                        <button key={block.id} className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-paper" onClick={() => void unblockUser(block.user)} type="button">
                          <span role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setContactDetailsUser(block.user); }}><Avatar name={block.user.nickname} url={block.user.avatarUrl} /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{block.user.nickname}</p>
                            <p className="truncate text-sm text-slate-500">{block.user.email ?? block.user.phone ?? block.user.id}</p>
                          </div>
                          <BlockToggle checked={true} />
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {query.trim().length < 2 ? (
                  <div className="px-4 py-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">{t.friendsTitle}</p>
                    {friendDataLoading ? <p className="py-4 text-sm text-slate-500">{t.searching}</p> : null}
                    {!friendDataLoading && visibleFriends.length === 0 ? <p className="py-4 text-sm text-slate-500">{t.empty}</p> : null}
                    <div className="space-y-1">
                      {visibleFriends.map((friend) => (
                        <button key={friend.id} className="flex w-full items-center gap-3 rounded px-2 py-2 text-left hover:bg-paper" onClick={() => startDirectConversation(friend)} type="button">
                          <span className="relative shrink-0" role="button" tabIndex={0} onClick={(event) => { event.stopPropagation(); setContactDetailsUser(friend); }}><Avatar name={friend.nickname} url={friend.avatarUrl} /><OnlineDot online={Boolean(friend.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /></span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-ink">{friend.nickname}</p>
                            <p className="truncate text-sm text-slate-500">{friend.email ?? friend.phone ?? friend.id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button className="grid h-9 w-9 place-items-center rounded border border-line text-slate-500 hover:border-brand" onClick={(event) => { event.stopPropagation(); setContactDetailsUser(friend); }} title={t.viewContactDetails} aria-label={t.viewContactDetails} type="button"><Users size={18} /></button>
                            <MessageCircle className="text-brand" size={18} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {contactsLoading ? <p className="px-4 py-4 text-sm text-slate-500">{t.searching}</p> : null}
                {!contactsLoading && query.trim().length >= 2 && contactResults.length === 0 ? <p className="px-4 py-4 text-sm text-slate-500">{t.empty}</p> : null}
                {query.trim().length >= 2
                  ? contactResults.map((user) => (
                      <div key={user.id} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper">
                        <button className="relative shrink-0" onClick={() => setContactDetailsUser(user)} type="button" aria-label={t.viewContactDetails}><Avatar name={user.nickname} url={user.avatarUrl} /><OnlineDot online={Boolean(user.online)} className="absolute -bottom-0.5 -right-0.5 ring-2 ring-white" /></button>
                        <button className="min-w-0 flex-1 text-left" onClick={() => startDirectConversation(user)} type="button">
                          <p className="truncate font-medium text-ink">{user.nickname}</p>
                          <p className="truncate text-sm text-slate-500">{user.email ?? user.phone ?? user.id}</p>
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded border border-line text-slate-500 hover:border-brand" onClick={() => setContactDetailsUser(user)} title={t.viewContactDetails} aria-label={t.viewContactDetails} type="button">
                          <Users size={18} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded border border-line text-brand hover:border-brand" onClick={() => void saveContact(user)} title={t.addFriend} aria-label={t.addFriend} type="button">
                          <UserPlus size={18} />
                        </button>
                        <button className="grid h-9 w-9 place-items-center rounded border border-line text-brand hover:border-brand" onClick={() => void startDirectConversation(user)} title={t.openChat} aria-label={t.openChat} type="button">
                          <MessageCircle size={18} />
                        </button>

                      </div>
                    ))
                  : null}
              </div>
            ) : null}

            {tab === "me" ? (
              <div className="space-y-3 p-4">
                <form className="rounded border border-line bg-white p-4" onSubmit={handleSaveProfile}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <button className="shrink-0" onClick={() => (profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl) ? setPreviewMedia({ url: normalizeMediaUrl(profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl) ?? (profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl), type: "avatar", name: profileNicknameValue || currentUser?.nickname || "User" }) : null} type="button" aria-label={t.mediaOpen}><Avatar name={profileNicknameValue || currentUser?.nickname || "User"} url={profileAvatarPreviewUrl || profileAvatarUrl || ownAvatarUrl} /></button>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{profileNicknameValue || currentUser?.nickname}</p>
                        <p className="truncate text-sm text-slate-500">{profileSignature || (profilePublicId ? `ID: ${profilePublicId}` : currentUser?.email || currentUser?.phone || currentUser?.id)}</p>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <input ref={avatarFileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleAvatarInputChange} />
                      <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={avatarUploading} onClick={() => avatarFileInputRef.current?.click()} type="button">
                        {avatarUploading ? `${t.uploadingMedia} ${avatarUploadProgress}%` : t.uploadAvatar}
                      </button>
                      <label className="flex items-center gap-2 text-sm text-ink">
                        <input checked={showSenderNames} onChange={(event) => setShowSenderNames(event.target.checked)} type="checkbox" />
                        {t.showSenderNames}
                      </label>
                    </div>
                    <div className="rounded border border-line bg-paper px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{t.profileSignature}</p>
                        <div className="flex shrink-0 gap-2">
                          <button className="rounded border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileSignatureEditing(true); }} type="button">{t.editSignature}</button>
                          <button className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSignatureSaving || !profileSignatureEditing} onClick={() => void handleSaveSignature()} type="button">{profileSignatureSaving ? "..." : t.saveSignature}</button>
                        </div>
                      </div>
                      <input className="mt-2 h-10 w-full rounded border border-line bg-white px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileSignatureEditing} maxLength={160} value={profileSignature} onChange={(event) => setProfileSignature(event.target.value)} />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{t.registeredInfo}</p>
                      <div className="flex shrink-0 gap-2">
                        <button className="rounded border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => { setProfileNotice(""); setProfileEditing(true); }} type="button">{t.editProfile}</button>
                        <button className="rounded bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={profileSaving || profileNicknameValue.trim().length < 2 || !profileEditing} type="submit">{profileSaving ? "..." : t.saveProfile}</button>
                      </div>
                    </div>
                    {profileNotice ? <div className="glimpse-notice-fade rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">{localizeNoticeMessage(profileNotice, uiLanguage)}</div> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-500">{t.profileEmail}<input className="mt-1 h-10 w-full rounded border border-line bg-paper px-3 text-sm text-slate-500" disabled value={currentUser?.email ?? ""} readOnly /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profilePhone}<input className="mt-1 h-10 w-full rounded border border-line bg-paper px-3 text-sm text-slate-500" disabled value={currentUser?.phone ?? ""} readOnly /></label>
                      <label className="block text-xs font-medium text-slate-500 sm:col-span-2">{t.profilePublicId}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={32} value={profilePublicId} onChange={(event) => { setProfileNotice(""); setProfilePublicId(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, "")); }} /><span className="mt-1 block text-[11px] font-normal text-slate-400">{t.profileIdHint}</span></label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink sm:col-span-2"><input checked={profileIsPublic} disabled={profileSaving} onChange={(event) => void handleToggleProfilePublic(event.target.checked)} type="checkbox" />{t.profilePublic}</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink"><input checked={profileEmailPublic} disabled={profileSaving || !profileIsPublic || !currentUser?.email} onChange={(event) => void handleToggleProfileEmailPublic(event.target.checked)} type="checkbox" />{t.profileEmailPublic}</label>
                      <label className="flex items-center gap-2 text-sm font-medium text-ink"><input checked={profilePhonePublic} disabled={profileSaving || !profileIsPublic || !currentUser?.phone} onChange={(event) => void handleToggleProfilePhonePublic(event.target.checked)} type="checkbox" />{t.profilePhonePublic}</label>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs font-medium text-slate-500">{t.profileNickname}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={60} value={profileNicknameValue} onChange={(event) => setProfileNicknameValue(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileCompany}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileCompany} onChange={(event) => setProfileCompany(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileTitle}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileTitle} onChange={(event) => setProfileTitle(event.target.value)} /></label>
                      <label className="block text-xs font-medium text-slate-500">{t.profileLocation}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={120} value={profileLocation} onChange={(event) => setProfileLocation(event.target.value)} /></label>
                    </div>
                    <label className="block text-xs font-medium text-slate-500">{t.profileBio}<textarea className="mt-1 min-h-20 w-full resize-y rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-paper disabled:text-slate-500" disabled={!profileEditing} maxLength={500} value={profileBio} onChange={(event) => setProfileBio(event.target.value)} /></label>
                  </div>
                </form>
                {currentUser?.role === "admin" ? (
                  <div className="rounded border border-line bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{t.adminDashboard}</p>
                      <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminLoading} onClick={() => void loadAdminDashboard()} type="button">
                        {adminLoading ? "..." : t.adminLoad}
                      </button>
                    </div>
                  </div>
                ) : null}
                {currentUser?.role === "admin" && adminModalOpen ? (
                  <div className="fixed inset-0 z-50 bg-slate-950/45 p-3 sm:p-6">
                    <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded bg-white shadow-2xl">
                      <div className="flex items-center justify-between border-b border-line px-4 py-3">
                        <p className="text-base font-semibold text-ink">{t.adminDashboard}</p>
                        <div className="flex items-center gap-2">
                          <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminLoading} onClick={() => void loadAdminDashboard()} type="button">
                            {adminLoading ? "..." : t.adminLoad}
                          </button>
                          <button className="rounded border border-line px-3 py-2 text-xs font-medium text-ink hover:border-brand" onClick={() => setAdminModalOpen(false)} type="button">
                            {t.adminClose}
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 overflow-auto bg-paper p-4">
                        {adminOverview ? (
                          <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-5">
                            <div className="rounded border border-line bg-white p-3"><span className="block text-slate-400">{t.adminUsers}</span><strong className="text-lg text-ink">{adminOverview.users}</strong></div>
                            <div className="rounded border border-line bg-white p-3"><span className="block text-slate-400">{t.adminDisabledUsers}</span><strong className="text-lg text-ink">{adminOverview.disabledUsers}</strong></div>
                            <div className="rounded border border-line bg-white p-3"><span className="block text-slate-400">{t.adminConversations}</span><strong className="text-lg text-ink">{adminOverview.conversations}</strong></div>
                            <div className="rounded border border-line bg-white p-3"><span className="block text-slate-400">{t.adminMessages}</span><strong className="text-lg text-ink">{adminOverview.messages}</strong></div>
                            <div className="rounded border border-line bg-white p-3"><span className="block text-slate-400">{t.adminOpenFeedback}</span><strong className="text-lg text-ink">{adminOverview.openFeedback}</strong></div>
                          </div>
                        ) : null}
                        {adminPasswordReset ? (
                          <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                            <p className="font-medium">{adminPasswordReset.user.nickname} · {t.adminTempPassword}</p>
                            <p className="mt-1 font-mono">{adminPasswordReset.temporaryPassword}</p>
                          </div>
                        ) : null}
                        {adminSelectedUserChats ? (
                          <div className="mt-4 rounded border border-line bg-white">
                            <div className="flex items-center justify-between gap-3 border-b border-line px-3 py-2">
                              <div>
                                <p className="text-xs font-medium text-ink">{t.adminUserChats}</p>
                                <p className="text-xs text-slate-500">{adminSelectedUserChats.user.nickname} · {adminSelectedUserChats.user.email ?? adminSelectedUserChats.user.phone ?? adminSelectedUserChats.user.id}</p>
                              </div>
                              <button className="rounded border border-line px-2 py-1 text-xs font-medium text-ink hover:border-brand" type="button" onClick={() => setAdminSelectedUserChats(null)}>{t.adminClose}</button>
                            </div>
                            <div className="grid gap-3 p-3 text-xs lg:grid-cols-[280px_1fr]">
                              <div className="rounded border border-line bg-paper p-3 text-slate-600">
                                <p className="font-medium text-ink">{t.adminUserDetails}</p>
                                <div className="mt-3 flex items-center gap-3">
                                  <Avatar name={adminSelectedUserChats.user.nickname} url={adminSelectedUserChats.user.avatarUrl} />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-ink">{adminSelectedUserChats.user.nickname}</p>
                                    <p className="text-slate-500">{adminSelectedUserChats.user.disabledAt ? t.adminDisabledUsers : "Active"}</p>
                                  </div>
                                </div>
                                <dl className="mt-3 space-y-2">
                                  <div><dt className="text-slate-400">ID</dt><dd className="break-all text-ink">{adminSelectedUserChats.user.id}</dd></div>
                                  <div><dt className="text-slate-400">Email</dt><dd>{adminSelectedUserChats.user.email ?? "No email"}</dd></div>
                                  <div><dt className="text-slate-400">Phone</dt><dd>{adminSelectedUserChats.user.phone ?? "No phone"}</dd></div>
                                  <div><dt className="text-slate-400">Role / Language</dt><dd>{adminSelectedUserChats.user.role} / {adminSelectedUserChats.user.language}</dd></div>
                                  <div><dt className="text-slate-400">Created</dt><dd>{adminSelectedUserChats.user.createdAt}</dd></div>
                                  <div><dt className="text-slate-400">Updated</dt><dd>{adminSelectedUserChats.user.updatedAt ?? ""}</dd></div>
                                  {adminSelectedUserChats.user.disabledAt ? <div><dt className="text-slate-400">Disabled</dt><dd>{adminSelectedUserChats.user.disabledAt}</dd></div> : null}
                                  <div><dt className="text-slate-400">Company / Title</dt><dd>{adminSelectedUserChats.user.profileCompany || "-"} {adminSelectedUserChats.user.profileTitle || ""}</dd></div>
                                  <div><dt className="text-slate-400">Location</dt><dd>{adminSelectedUserChats.user.profileLocation || "-"}</dd></div>
                                  <div><dt className="text-slate-400">Signature</dt><dd className="whitespace-pre-wrap">{adminSelectedUserChats.user.profileSignature || "-"}</dd></div>
                                  <div><dt className="text-slate-400">Bio</dt><dd className="whitespace-pre-wrap">{adminSelectedUserChats.user.profileBio || "-"}</dd></div>
                                </dl>
                              </div>
                              <div className="max-h-[42vh] space-y-3 overflow-auto pr-1">
                                {adminSelectedUserChats.conversations.length === 0 ? <p className="text-slate-400">{t.adminNoResults}</p> : null}
                                {adminSelectedUserChats.conversations.map((conversation) => (
                                  <div key={conversation.id} className="rounded border border-line bg-white">
                                    <div className="border-b border-line px-3 py-2">
                                      <p className="font-medium text-ink">{conversation.title || conversation.id} <span className="text-slate-400">{conversation.type}</span></p>
                                      <p className="text-slate-500">{t.adminMembers}: {conversation.members.map((member) => member.nickname).join(", ")} · {t.adminMessageCount}: {conversation.messageCount}</p>
                                    </div>
                                    <div className="space-y-2 px-3 py-2">
                                      {conversation.messages.length === 0 ? <p className="text-slate-400">{t.adminNoMessages}</p> : null}
                                      {conversation.messages.map((message) => (
                                        <div key={message.id} className="rounded border border-line bg-paper px-3 py-2">
                                          <p className="font-medium text-ink">{message.senderName} <span className="text-slate-400">{message.type} · {message.createdAt}</span></p>
                                          {message.body ? <p className="mt-1 whitespace-pre-wrap text-slate-700">{message.body}</p> : null}
                                          {message.mediaUrl ? <p className="mt-1 break-all text-slate-500">{message.mediaUrl}</p> : null}
                                          {message.translations.length > 0 ? (
                                            <div className="mt-2 space-y-1 border-l-2 border-line pl-2 text-slate-500">
                                              {message.translations.map((translation) => <p key={`${message.id}-${translation.language}`}>{translation.language}: {translation.body}</p>)}
                                            </div>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <div className="rounded border border-line bg-white">
                            <div className="border-b border-line px-3 py-2">
                              <p className="text-xs font-medium text-ink">{t.adminUsers}</p>
                              <div className="mt-2 flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-xs text-slate-500">
                                <Search size={14} />
                                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchUsers} value={adminUserQuery} onChange={(event) => setAdminUserQuery(event.target.value)} />
                              </div>
                            </div>
                            <div className="max-h-[56vh] overflow-auto">
                              {filteredAdminUsers.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                              {filteredAdminUsers.map((user) => (
                                <div key={user.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-ink">{user.nickname} <span className="text-slate-400">{user.role}</span></p>
                                      <p className="truncate text-slate-500">{user.email ?? user.phone ?? user.id}</p>
                                      <p className="text-slate-400">{user.disabledAt ? t.adminDisabledUsers : user.createdAt}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1">
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminUserChatsLoadingId === user.id} type="button" onClick={() => void loadAdminUserChats(user)}>{adminUserChatsLoadingId === user.id ? "..." : t.adminViewChats}</button>
                                      {user.id !== currentUser?.id ? (
                                        <>
                                          <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminActionUserId === user.id} type="button" onClick={() => void setAdminUserDisabled(user, !user.disabledAt)}>{user.disabledAt ? t.adminEnableUser : t.adminDisableUser}</button>
                                          <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminActionUserId === user.id} type="button" onClick={() => void resetAdminUserPassword(user)}>{t.adminResetPassword}</button>
                                        </>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="rounded border border-line bg-white">
                            <div className="border-b border-line px-3 py-2">
                              <p className="text-xs font-medium text-ink">{t.adminFeedbackQueue}</p>
                              <div className="mt-2 flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-xs text-slate-500">
                                <Search size={14} />
                                <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchFeedback} value={adminFeedbackQuery} onChange={(event) => setAdminFeedbackQuery(event.target.value)} />
                              </div>
                            </div>
                            <div className="max-h-[56vh] overflow-auto">
                              {filteredAdminFeedback.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                              {filteredAdminFeedback.map((feedback) => (
                                <div key={feedback.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-ink">{feedback.user.nickname} <span className="text-slate-400">{feedback.category} · {feedback.status}</span></p>
                                      <p className="line-clamp-2 text-slate-500">{feedback.message}</p>
                                      <p className="truncate text-slate-400">{feedback.attachmentUrl ?? feedback.createdAt}</p>
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1">
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "in_review")}>{t.adminMarkInReview}</button>
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "resolved")}>{t.adminMarkResolved}</button>
                                      <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={adminFeedbackActionId === feedback.id} type="button" onClick={() => void updateAdminFeedbackStatus(feedback, "dismissed")}>{t.adminMarkDismissed}</button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="mt-4 rounded border border-line bg-white">
                          <div className="border-b border-line px-3 py-2">
                            <p className="text-xs font-medium text-ink">{t.adminRecentConversations}</p>
                            <div className="mt-2 flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-xs text-slate-500">
                              <Search size={14} />
                              <input className="min-w-0 flex-1 bg-transparent outline-none" placeholder={t.adminSearchConversations} value={adminConversationQuery} onChange={(event) => setAdminConversationQuery(event.target.value)} />
                            </div>
                          </div>
                          <div className="max-h-[34vh] overflow-auto">
                            {filteredAdminConversations.length === 0 ? <p className="px-3 py-3 text-xs text-slate-400">{t.adminNoResults}</p> : null}
                            {filteredAdminConversations.map((conversation) => (
                              <div key={conversation.id} className="border-b border-line px-3 py-2 text-xs last:border-b-0">
                                <p className="font-medium text-ink">{conversation.title || conversation.id} <span className="text-slate-400">{conversation.type}</span></p>
                                <p className="text-slate-500">{t.adminMembers}: {conversation.memberCount} · {t.adminMessageCount}: {conversation.messageCount}</p>
                                <p className="truncate text-slate-400">{conversation.members.map((member) => member.nickname).join(", ")}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
                <form className="rounded border border-line bg-white p-4" onSubmit={submitFeedback}>
                  <p className="text-sm font-medium text-ink">{t.feedbackTitle}</p>
                  <p className="mt-1 text-xs text-slate-500">{t.feedbackHint}</p>
                                    <textarea className="mt-3 min-h-24 w-full resize-y rounded border border-line px-3 py-2 text-sm outline-none focus:border-brand" maxLength={2000} placeholder={t.feedbackPlaceholder} value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} />
                  <input ref={feedbackFileInputRef} className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleFeedbackAttachmentChange} />
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand disabled:opacity-60" disabled={feedbackAttachmentUploading} onClick={() => feedbackFileInputRef.current?.click()} type="button">
                      {feedbackAttachmentUploading ? `${t.uploadingMedia} ${feedbackAttachmentProgress}%` : t.feedbackAttach}
                    </button>
                    {feedbackAttachment ? (
                      <button className="rounded border border-line px-3 py-2 font-medium text-coral hover:border-coral" onClick={() => setFeedbackAttachment(null)} type="button">
                        {t.feedbackAttachmentRemove}
                      </button>
                    ) : null}
                    {feedbackAttachment ? <span>{feedbackAttachment.fileName}</span> : null}
                  </div>
                  <button className="mt-3 h-10 w-full rounded bg-brand text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={feedbackSaving || feedbackMessage.trim().length < 5} type="submit">
                    {feedbackSaving ? t.feedbackSending : t.feedbackSend}
                  </button>
                </form>
                <button className="w-full rounded border border-line px-3 py-3 text-left text-sm font-medium text-coral hover:border-coral" onClick={logout}>
                  {uiLanguage === "zh" ? "退出登录" : "Sign out"}
                </button>
              </div>
            ) : null}
          </section>
        </aside>

        <section className={`${mobilePane === "list" ? "hidden lg:flex" : "flex"} min-h-0 flex-1 flex-col bg-[#fbfbf7]`}>
          <header className="border-line flex h-16 items-center gap-2 border-b bg-white px-3 sm:px-4">
            <button aria-label="Back to chats" className="grid h-10 w-10 shrink-0 place-items-center rounded border border-line text-ink hover:border-brand lg:hidden" onClick={() => setMobilePane("list")} title="Back to chats" type="button">
              <ArrowLeft size={18} />
            </button>
            <button aria-label={selected.type === "group" ? t.groupManage : t.viewContactDetails} className="flex min-w-0 flex-1 items-center gap-2 rounded text-left hover:bg-paper" onClick={openSelectedDetails} type="button">
              <span className="shrink-0"><Avatar name={selected.name} url={selected.avatarUrl} kind={selected.type === "group" ? "group" : "user"} online={selected.type === "single" ? selectedPeerOnline : undefined} /></span>
              <span className="min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-lg font-semibold text-ink">{selected.name}</span>
                  {selected.type === "group" ? <span aria-label={connectionStatusLabels[uiLanguage][connectionState]} className={`h-2.5 w-2.5 shrink-0 rounded-full ${connectionState === "connected" ? "bg-emerald-500" : connectionState === "offline" ? "bg-coral" : "bg-amber-400"}`} title={connectionStatusLabels[uiLanguage][connectionState]} /> : null}
                </span>
                <span className="block truncate text-sm text-slate-500">{selected.language === "zh" ? "Chinese" : "English"} / {selected.type === "group" ? `${groupMembers.length || selected.memberCount || 0} ${t.groupMembers}` : "Server translation enabled; verify language coverage and fallback before public testing"}</span>
              </span>
            </button>
          </header>
          {selected.type === "group" && selected.announcement && (selected.announcementScroll === false || groupAnnouncementDismissedForId !== selected.id) ? (
            <div className="border-line border-b bg-amber-50 px-4 py-2 text-sm text-amber-900">
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <span className="shrink-0 font-medium">{t.groupAnnouncement}</span>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p key={`${selected.id}-${selected.announcement}-${selected.announcementScroll}`} className={selected.announcementScroll === false ? "whitespace-pre-wrap" : "inline-block min-w-full whitespace-nowrap"} style={selected.announcementScroll === false ? undefined : { animation: "glimpse-group-announcement-marquee 8s linear 3" }} onAnimationEnd={() => setGroupAnnouncementDismissedForId(selected.id)}>{selected.announcement}</p>
                </div>
              </div>
            </div>
          ) : null}
          {notice ? <div className="border-line border-b bg-white px-4 py-2 text-sm text-brand">{notice}</div> : null}
          {messageSelectMode ? (
            <div className="border-line flex shrink-0 items-center gap-2 border-t bg-paper px-4 py-2 text-sm">
              <span className="min-w-0 flex-1 text-slate-600">{selectedMessageIds.size} {uiLanguage === "zh" ? "已选" : "selected"}</span>
              <button className="rounded border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => openForwardMessages(selectedMessagesForCurrentConversation())} type="button">{uiLanguage === "zh" ? "转发" : "Forward"}</button>
              <button className="rounded border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={() => void copySelectedMessagesMerged()} type="button">{uiLanguage === "zh" ? "合并复制" : "Merge copy"}</button>
              <button className="rounded border border-coral bg-white px-3 py-1.5 font-medium text-coral hover:bg-coral/10" onClick={deleteSelectedMessagesLocally} type="button">{uiLanguage === "zh" ? "删除" : "Delete"}</button>
              <button className="rounded border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand" onClick={cancelMessageSelection} type="button">{uiLanguage === "zh" ? "取消" : "Cancel"}</button>
            </div>
          ) : null}
          <div ref={messageListRef} className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-5 pb-4">
            {!selectedExists ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.noConversations}</p>
              </div>
            ) : selectedMessageLoadState === "loading" && currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.loadingMessages}</p>
              </div>
            ) : selectedMessageLoadState === "failed" && currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <div className="space-y-3">
                  <p>{t.messagesFailed}</p>
                  <button className="rounded border border-line bg-white px-3 py-2 font-medium text-ink hover:border-brand" onClick={() => joinConversation(selected.id)} type="button">
                    {messageActionLabels[uiLanguage].retry}
                  </button>
                </div>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="grid min-h-[280px] place-items-center text-center text-sm text-slate-500">
                <p>{t.emptyConversation}</p>
              </div>
            ) : null}
            {selectedExists && historyCursors[selected.id] ? (
              <div className="flex justify-center">
                <button className="rounded border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">
                  {historyLoading ? t.loadingOlder : t.loadOlder}
                </button>
              </div>
            ) : null}
            {selectedExists && !historyCursors[selected.id] && historyEndReached[selected.id] && currentMessages.length > 0 ? (
              <div className="flex justify-center">
                <span className="rounded bg-white px-3 py-1 text-xs text-slate-400 shadow-sm">{t.noMoreMessages}</span>
              </div>
            ) : null}
            {currentMessages.map((message) => {
              const mine = message.senderId === currentUser?.id;
              const status = mine ? messageStatuses[message.id] ?? "delivered" : undefined;
              const messageTime = formatMessageTime(message.createdAt);
              const manualTranslationTarget = getManualTranslationTarget(message);
              const translations = message.translations ?? {};
              const locationPayload = message.type === "text" ? parseLocationMessage(message.body) : null;
              const isTextMessage = message.type === "text" && !locationPayload;
              const translated = isTextMessage ? translations[manualTranslationTarget] : undefined;
              const isTranslationLoading = translationLoading[message.id] ?? false;
              const translationError = translationErrors[message.id];
              const showOriginal = isTextMessage && (messageDisplayMode === "original" || messageDisplayMode === "bilingual" || !translated);
              const showTranslation = isTextMessage && Boolean(translated) && (messageDisplayMode === "translated" || messageDisplayMode === "bilingual");
              const messageMediaUrl = mediaPreviewUrl(message);
              const messageDownload = mediaDownloadUrl(message);
              const senderAvatarUrl = mine ? (profileAvatarPreviewUrl || profileAvatarUrl || currentUser?.avatarUrl) : (selected.type === "group" ? groupMembers.find((member) => member.user.id === message.senderId)?.user.avatarUrl : selected.avatarUrl);
              const revokeBatch = mine ? revokeBatchForMessage(message) : [];
              const selectedForMultiAction = selectedMessageIds.has(message.id);
              return (
                <article id={`message-${message.id}`} key={message.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`} onContextMenu={(event) => { event.preventDefault(); beginMessageSelect(message.id); }} onPointerDown={(event) => handleMessagePointerDown(event, message.id)} onPointerUp={clearMessageLongPressTimer} onPointerLeave={clearMessageLongPressTimer} onPointerCancel={clearMessageLongPressTimer}>
                  {messageSelectMode ? <button className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selectedForMultiAction ? "border-brand bg-brand text-white" : "border-line bg-white text-transparent"}`} onClick={() => toggleSelectedMessage(message.id)} type="button" aria-label={uiLanguage === "zh" ? "????" : "Select message"}><Check size={14} /></button> : null}
                  {!mine ? <button type="button" className="shrink-0" onClick={() => selected.type === "group" ? openUserDetails(groupMembers.find((member) => member.user.id === message.senderId)?.user) : openSelectedDetails()} aria-label={t.viewContactDetails}><Avatar name={message.senderName ?? selected.name} url={senderAvatarUrl} size="sm" /></button> : null}
                  <div className={`max-w-[760px] rounded p-3 shadow-sm ${highlightedMessageIds[message.id] ? "message-new-attention" : ""} ${message.revokedAt ? "border border-line bg-paper text-slate-500" : mine ? "bg-brand text-white" : "border border-line bg-white text-ink"}`}>
                    {message.revokedAt ? <p className="text-sm italic">{t.messageRevoked}</p> : null}
                    {!message.revokedAt && showSenderNames ? <p className="text-sm font-medium opacity-80">{message.senderName ?? message.senderId}</p> : null}
                    {!message.revokedAt && message.replyToMessageId ? (
                      <button className={`mb-2 block w-full rounded border-l-4 px-2 py-1.5 text-left text-xs ${mine ? "border-white/50 bg-white/10 text-white/80 hover:bg-white/15" : "border-brand/60 bg-paper text-slate-600 hover:bg-slate-100"}`} onClick={() => void jumpToQuotedMessage(message.replyToMessageId)} type="button">
                        <p className="font-medium">{message.replyToMessageSenderName ?? messageActionLabels[uiLanguage].reply}</p>
                        <p className="mt-0.5 line-clamp-2 break-words">{message.replyToMessageBody || `[${message.replyToMessageType ?? "message"}]`}</p>
                      </button>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "image" ? (
                      <div className="mt-2 space-y-2">
                        <button className="block overflow-hidden rounded border border-black/10 bg-black/5" onClick={() => setPreviewMedia({ url: messageMediaUrl, type: "image", name: message.body })} type="button" aria-label={t.mediaOpen} title={t.mediaOpen}>
                          <img className="max-h-80 max-w-full object-contain" src={mediaThumbnailUrl(message)} alt={message.body ?? "Image attachment"} />
                        </button>
                        <a className={`inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "video" ? (
                      <div className="mt-2 space-y-2">
                        <button className="block w-full overflow-hidden rounded border border-black/10 bg-black/80 text-left" onClick={() => handleVideoPreviewClick(messageMediaUrl, message.body)} onContextMenu={(event) => { event.preventDefault(); openVideoPreview(messageMediaUrl, message.body, true); }} onPointerDown={(event) => handleVideoPreviewPointerDown(event, messageMediaUrl, message.body)} onPointerUp={clearVideoPreviewLongPressTimer} onPointerLeave={clearVideoPreviewLongPressTimer} onPointerCancel={clearVideoPreviewLongPressTimer} type="button" aria-label={t.mediaOpen} title={t.mediaOpen}>
                          <video className="block h-auto max-h-80 max-w-full rounded bg-black object-contain" src={messageMediaUrl} preload="metadata" muted />
                        </button>
                        <a className={`inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "audio" ? (
                      <div className={`mt-2 flex max-w-[520px] items-start gap-3 rounded border p-3 ${mine ? "border-white/20 bg-white/10" : "border-line bg-paper"}`}>
                        <Music2 className="mt-1 shrink-0" size={20} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{message.body ?? "Audio"}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                            <button className="underline-offset-2 hover:underline" onClick={() => setPreviewMedia({ url: messageMediaUrl, type: "audio", name: message.body })} type="button">{t.mediaOpen}</button>
                            <button className="underline-offset-2 hover:underline" onClick={() => toggleVoiceTranscript(message)} type="button">{visibleTranscriptIds.has(message.id) ? t.voiceTranscriptHide : t.voiceTranscript}</button>
                          </div>
                          {visibleTranscriptIds.has(message.id) && message.transcript ? <p className="mt-2 rounded bg-white/70 px-2 py-1 text-sm text-ink">{message.transcript}</p> : null}
                          <audio className="mt-2 w-full" src={messageMediaUrl} controls preload="metadata" />
                        </div>
                        <a className="mt-1 shrink-0" href={messageDownload} download={message.body ?? "download"} title={t.downloadOriginal}><Download size={17} /></a>
                      </div>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && message.type === "file" ? (
                      <div className={`mt-2 max-w-[520px] rounded border p-3 text-sm ${mine ? "border-white/20 bg-white/10 text-white" : "border-line bg-paper text-ink"}`}>
                        {isPdfFile(message) ? (
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => setPreviewMedia({ url: messageMediaUrl, type: "pdf", name: message.body, downloadUrl: messageDownload })} type="button" title={t.pdfPreview}>
                            <FileText className="shrink-0" size={20} />
                            <span className="min-w-0 flex-1 truncate">{message.body ?? "PDF"}</span>
                            <span className={`shrink-0 text-xs font-medium ${mine ? "text-white/80" : "text-brand"}`}>{t.pdfPreview}</span>
                          </button>
                        ) : (
                          <a className="flex items-center gap-3" href={messageDownload} download={message.body ?? "download"} title={message.body ?? "File attachment"}>
                            <FileText className="shrink-0" size={20} />
                            <span className="min-w-0 flex-1 truncate">{message.body ?? "File attachment"}</span>
                            <Download className="shrink-0" size={17} />
                          </a>
                        )}
                        {isPdfFile(message) ? <a className={`mt-2 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-slate-500"}`} href={messageDownload} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a> : null}
                        {isZipArchive(message) ? <button className={`mt-2 text-xs font-medium underline-offset-2 hover:underline ${mine ? "text-white/80" : "text-brand"}`} onClick={() => void openArchivePreview(message)} type="button">{uiLanguage === "zh" ? "预览压缩包" : "Preview archive"}</button> : null}
                      </div>
                    ) : null}
                    {!message.revokedAt && locationPayload ? (
                      <a className={`mt-2 flex max-w-sm items-center gap-3 rounded border p-3 text-left transition hover:opacity-90 ${mine ? "border-white/20 bg-white/10 text-white" : "border-line bg-paper text-ink"}`} href={locationMapUrl(locationPayload)} target="_blank" rel="noreferrer">
                        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded ${mine ? "bg-white/15" : "bg-brand text-white"}`}><MapPin size={21} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{locationMessageTitle(locationPayload)}</span>
                          <span className={`mt-1 block text-xs ${mine ? "text-white/70" : "text-slate-500"}`}>{locationPayload.latitude.toFixed(6)}, {locationPayload.longitude.toFixed(6)}</span>
                        </span>
                      </a>
                    ) : null}
                    {!message.revokedAt && message.mediaUrl && !["file", "audio"].includes(message.type) && message.body ? <p className="mt-2 break-words text-sm opacity-80">{message.body}</p> : null}
                    {!message.revokedAt && showOriginal ? <p className="mt-1 whitespace-pre-wrap break-words text-base leading-6">{message.body}</p> : null}
                    {!message.revokedAt && showTranslation ? (
                      <div className={`mt-2 whitespace-pre-wrap break-words rounded border p-2 text-base leading-6 ${messageDisplayMode === "translated" ? "border-transparent p-0" : mine ? "border-white/25 bg-white/10 text-sm" : "border-line bg-paper text-sm text-slate-700"}`}>
                        {translated}
                      </div>
                    ) : null}
                    {!message.revokedAt && translationError && !translated ? (
                      <div className={`mt-2 rounded border px-2 py-1.5 text-xs ${mine ? "border-white/25 bg-white/10 text-white/80" : "border-coral/30 bg-coral/10 text-coral"}`}>
                        <span>{messageActionLabels[uiLanguage].translationUnavailable}</span>
                        <button className={`ml-2 font-semibold underline-offset-2 hover:underline ${mine ? "text-white" : "text-coral"}`} disabled={isTranslationLoading} onClick={() => void refreshTranslation(message)} type="button">
                          {messageActionLabels[uiLanguage].retryTranslation}
                        </button>
                      </div>
                    ) : null}
                    <div className={`mt-2 flex items-center justify-end gap-2 text-xs ${mine ? "text-white/70" : "text-slate-400"}`}>                      {!message.revokedAt && isTextMessage ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} disabled={isTranslationLoading} onClick={() => void refreshTranslation(message)} title={messageActionLabels[uiLanguage].translate} aria-label={messageActionLabels[uiLanguage].translate} type="button">
                          <RefreshCw className={isTranslationLoading ? "animate-spin" : undefined} size={13} />
                        </button>
                      ) : null}
                      {!message.revokedAt && isTextMessage && message.body?.trim() ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${speakingMessageKey === message.id + ":original" ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => readOriginalMessage(message)} title={messageActionLabels[uiLanguage].readOriginal} aria-label={messageActionLabels[uiLanguage].readOriginal} type="button">
                          <Volume2 size={13} />
                        </button>
                      ) : null}
                      {!message.revokedAt && translated ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${speakingMessageKey === message.id + ":translation:" + manualTranslationTarget ? mine ? "bg-white/15 text-white" : "bg-paper text-ink" : mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => readTranslatedMessage(message, translated, manualTranslationTarget)} title={messageActionLabels[uiLanguage].readTranslation} aria-label={messageActionLabels[uiLanguage].readTranslation} type="button">
                          <Volume2 size={13} />
                        </button>
                      ) : null}
                      {canRevokeMessage(message) ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => void revokeMessage(message)} title={t.revokeMessage} aria-label={t.revokeMessage} type="button">
                          <RotateCcw size={13} />
                        </button>
                      ) : null}
                      {revokeBatch.length > 1 ? (
                        <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => void revokeMessageBatch(message)} title={messageActionLabels[uiLanguage].revokeBatch} aria-label={messageActionLabels[uiLanguage].revokeBatch} type="button">
                          <RefreshCw size={13} />
                        </button>
                      ) : null}                      {!message.revokedAt ? (
                        <>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => openForwardMessages([message])} title={uiLanguage === "zh" ? "转发" : "Forward"} aria-label={uiLanguage === "zh" ? "转发" : "Forward"} type="button">
                            <Send size={13} />
                          </button>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => setReminderForMessage(message)} title={messageActionLabels[uiLanguage].remind} aria-label={messageActionLabels[uiLanguage].remind} type="button">
                            <Bell size={13} />
                          </button>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => startReply(message)} title={messageActionLabels[uiLanguage].reply} aria-label={messageActionLabels[uiLanguage].reply} type="button">
                            <Reply size={13} />
                          </button>
                          <button className={`grid h-6 w-6 place-items-center rounded ${mine ? "text-white/70 hover:bg-white/10 hover:text-white" : "text-slate-400 hover:bg-paper hover:text-ink"}`} onClick={() => void copyMessageText(message)} title={messageActionLabels[uiLanguage].copy} aria-label={messageActionLabels[uiLanguage].copy} type="button">
                            <Copy size={13} />
                          </button>
                        </>
                      ) : null}
                      {messageTime ? <span>{messageTime}</span> : null}
                      {status ? (
                        <span className="flex items-center gap-1" data-message-status={status} title={messageStatusLabels[uiLanguage][status]} aria-label={messageStatusLabels[uiLanguage][status]}>
                          {status === "sending" ? <span>{messageStatusLabels[uiLanguage][status]}</span> : null}
                          {status === "sent" ? <Check size={14} strokeWidth={2.4} /> : null}
                          {status === "delivered" ? <CheckCheck size={14} strokeWidth={2.4} /> : null}
                          {status === "read" ? <CheckCheck className="text-sky-500" size={14} strokeWidth={2.4} /> : null}
                          {status === "failed" ? <span className="text-coral">{messageStatusLabels[uiLanguage][status]}</span> : null}
                        </span>
                      ) : null}
                      {status === "failed" ? (
                        <button className="rounded border border-coral/40 bg-white/90 px-2 py-1 font-medium text-coral hover:border-coral" onClick={() => retryMessage(message)} type="button">
                          {messageActionLabels[uiLanguage].retry}
                        </button>
                      ) : null}
                    </div>
                  </div>
                  {mine ? <button type="button" className="shrink-0" onClick={() => currentUser ? openUserDetails(currentUser) : null} aria-label={t.viewContactDetails}><Avatar name={currentUser?.nickname ?? "Me"} url={senderAvatarUrl} size="sm" /></button> : null}
                </article>
              );
            })}
          </div>

          <form className="border-line shrink-0 border-t bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3" onSubmit={sendMessage}>
            {voiceRecording || voiceTranscriptDraft ? <div className="border-line border-t bg-white px-3 py-2 text-xs text-slate-500">{voiceRecording ? t.voiceRecording : t.voiceTranscript}: {voiceTranscriptDraft || "..."}</div> : null}
            {pendingVoicePreview ? (
              <div className="mb-3 rounded border border-line bg-paper p-3 text-xs text-slate-600">
                <p className="mb-2 font-medium text-ink">{t.voicePreviewReady}</p>
                <audio className="w-full" src={pendingVoicePreview.url} controls />
                {pendingVoicePreview.transcript ? <p className="mt-2 rounded bg-white px-2 py-1 text-sm text-ink">{pendingVoicePreview.transcript}</p> : null}
                <div className="mt-3 flex justify-end gap-2">
                  <button className="rounded border border-line px-3 py-2 font-medium text-ink hover:border-brand" onClick={cancelPendingVoice} type="button">{t.voiceCancel}</button>
                  <button className="rounded bg-brand px-3 py-2 font-medium text-white hover:bg-teal-800" onClick={() => void sendPendingVoice()} type="button">{t.voiceSendConfirm}</button>
                </div>
              </div>
            ) : null}
            {mediaUploading ? (
              <div className="mb-3 rounded border border-line bg-paper p-3 text-xs text-slate-600">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span>{t.uploadingMedia}</span>
                  <span className="font-medium text-ink">{mediaUploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-slate-200">
                  <div className="h-full rounded bg-brand transition-[width]" style={{ width: `${mediaUploadProgress}%` }} />
                </div>
              </div>
            ) : null}
            {replyingToMessage ? (
              <div className="mb-3 flex items-center gap-3 rounded border border-line bg-paper px-3 py-2 text-xs text-slate-600">
                <Reply size={14} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink">{messageActionLabels[uiLanguage].reply}: {replyingToMessage.senderName ?? "Message"}</p>
                  <p className="truncate">{replyingToMessage.body || `[${replyingToMessage.type}]`}</p>
                </div>
                <button className="rounded border border-line px-2 py-1 font-medium text-ink hover:border-brand" type="button" onClick={() => setReplyingToMessage(null)}>x</button>
              </div>
            ) : null}
            <div className="relative">
              {composerMenuOpen ? (
                <div className="absolute bottom-full right-0 z-10 mb-2 grid w-52 gap-1 rounded border border-line bg-white p-2 text-sm shadow-xl">
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); mediaInputRef.current?.click(); }} type="button"><Paperclip size={17} />{t.attach}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => { setComposerMenuOpen(false); setLocationModalOpen(true); }} type="button"><MapPin size={17} />{uiLanguage === "zh" ? "发送位置" : "Send location"}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || Boolean(activeCall)} onClick={() => { setComposerMenuOpen(false); void startCall("audio"); }} type="button"><Phone size={17} />{callLabels[uiLanguage].audioCall}</button>
                  <button className="flex items-center gap-2 rounded px-3 py-2 text-left text-ink hover:bg-paper disabled:opacity-50" disabled={!selectedExists || Boolean(activeCall)} onClick={() => { setComposerMenuOpen(false); void startCall("video"); }} type="button"><Video size={17} />{callLabels[uiLanguage].videoCall}</button>
                </div>
              ) : null}
              <div className="flex items-end gap-2">
                <input ref={mediaInputRef} className="hidden" type="file" onChange={handleMediaInputChange} />
                <button type="button" aria-label={voiceRecording ? t.voiceRecordStop : t.voiceRecordStart} title={voiceRecording ? t.voiceRecordStop : t.voiceRecordStart} className={`relative grid h-11 w-11 shrink-0 place-items-center rounded border transition-colors disabled:opacity-50 ${voiceRecording ? "border-coral bg-coral text-white shadow-sm" : "border-line text-ink hover:border-brand"}`} disabled={!selectedExists || mediaUploading} onClick={() => voiceRecording ? stopVoiceRecording() : void startVoiceRecording()}>
                  {voiceRecording ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> : null}
                  <Mic size={19} />
                </button>
                <textarea ref={draftTextareaRef} rows={1} className="h-11 max-h-28 min-h-11 flex-1 resize-none overflow-y-auto rounded border border-line px-3 py-2 leading-7 outline-none focus:border-brand disabled:bg-paper disabled:text-slate-400" disabled={!selectedExists} placeholder={t.input} value={draft} onChange={(event) => { setDraft(event.target.value); if (event.target.value.trim()) setComposerMenuOpen(false); resizeDraftTextarea(event.currentTarget); }} />
                {draft.trim() ? (
                  <button type="submit" aria-label="Send message" className="grid h-11 w-11 shrink-0 place-items-center rounded bg-brand text-white hover:bg-teal-800 disabled:opacity-50" disabled={!selectedExists || mediaUploading}>
                    <Send size={19} />
                  </button>
                ) : (
                  <button type="button" aria-label={uiLanguage === "zh" ? "更多" : "More"} title={uiLanguage === "zh" ? "更多" : "More"} className="grid h-11 w-11 shrink-0 place-items-center rounded border border-line text-ink hover:border-brand disabled:opacity-50" disabled={!selectedExists || mediaUploading} onClick={() => setComposerMenuOpen((open) => !open)}>
                    <Plus size={21} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </section>
        {locationModalOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4" onClick={() => setLocationModalOpen(false)}>
            <div className="w-full max-w-md rounded bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-semibold text-ink">{uiLanguage === "zh" ? "发送位置" : "Send location"}</p>
                <button className="rounded border border-line px-3 py-1.5 text-xs text-ink hover:border-brand" onClick={() => setLocationModalOpen(false)} type="button">{uiLanguage === "zh" ? "关闭" : "Close"}</button>
              </div>
              <div className="space-y-3">
                <button className="flex h-10 w-full items-center justify-center gap-2 rounded border border-line px-3 text-sm font-medium text-ink hover:border-brand disabled:opacity-60" disabled={locationLoading} onClick={useCurrentLocation} type="button">
                  <Navigation size={17} />{locationLoading ? (uiLanguage === "zh" ? "定位中..." : "Locating...") : (uiLanguage === "zh" ? "使用当前位置" : "Use current location")}
                </button>
                <label className="block text-sm font-medium text-ink">{uiLanguage === "zh" ? "位置名称" : "Location name"}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" maxLength={120} value={locationName} onChange={(event) => setLocationName(event.target.value)} placeholder={uiLanguage === "zh" ? "例如：客户工厂" : "Example: Customer factory"} /></label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-ink">{uiLanguage === "zh" ? "纬度" : "Latitude"}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" inputMode="decimal" value={locationLatitude} onChange={(event) => setLocationLatitude(event.target.value)} placeholder="22.543096" /></label>
                  <label className="block text-sm font-medium text-ink">{uiLanguage === "zh" ? "经度" : "Longitude"}<input className="mt-1 h-10 w-full rounded border border-line px-3 text-sm outline-none focus:border-brand" inputMode="decimal" value={locationLongitude} onChange={(event) => setLocationLongitude(event.target.value)} placeholder="114.057865" /></label>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand" onClick={() => { resetLocationDraft(); setLocationModalOpen(false); }} type="button">{uiLanguage === "zh" ? "取消" : "Cancel"}</button>
                <button className="rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" disabled={!locationLatitude.trim() || !locationLongitude.trim()} onClick={sendLocationMessage} type="button">{uiLanguage === "zh" ? "发送" : "Send"}</button>
              </div>
            </div>
          </div>
        ) : null}
        {avatarCropSource ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
            <div className="w-full max-w-sm rounded bg-white p-4 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-semibold text-ink">{t.cropAvatarTitle}</p>
                <button className="rounded border border-line px-3 py-1.5 text-xs text-ink" onClick={() => setAvatarCropSource("")} type="button">{t.cropAvatarCancel}</button>
              </div>
              <div
                ref={avatarCropFrameRef}
                className="relative mx-auto aspect-square w-full max-w-80 touch-none overflow-hidden rounded bg-slate-950 select-none"
                onPointerDown={handleAvatarCropPointerDown}
                onPointerMove={handleAvatarCropPointerMove}
                onPointerUp={handleAvatarCropPointerEnd}
                onPointerCancel={handleAvatarCropPointerEnd}
                onWheel={handleAvatarCropWheel}
              >
                <img
                  className="absolute left-1/2 top-1/2 max-w-none select-none"
                  draggable={false}
                  src={avatarCropSource}
                  alt={t.cropAvatarTitle}
                  onLoad={(event) => { setAvatarCropImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }); setAvatarCropFrameSize(avatarCropFrameRef.current?.clientWidth || 320); }}
                  style={{ transform: `translate(calc(-50% + ${avatarCropOffset.x}px), calc(-50% + ${avatarCropOffset.y}px)) scale(${avatarCropScale})`, width: `${avatarCropPreviewWidth}px`, height: `${avatarCropPreviewHeight}px` }}
                />
                <div className="pointer-events-none absolute inset-0 border-2 border-white/95 shadow-[0_0_0_999px_rgba(15,23,42,0.35)]" />
                <div className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/35" />
                <div className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/35" />
                <div className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/35" />
                <div className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/35" />
              </div>
              <button className="mt-4 h-10 w-full rounded bg-brand text-sm font-medium text-white" onClick={() => void confirmAvatarCrop()} type="button">{t.cropAvatarConfirm}</button>
            </div>
          </div>
        ) : null}
        {conversationMenu ? (
          <div className="fixed inset-0 z-40" onClick={() => setConversationMenu(null)}>
            <div className="absolute w-44 rounded border border-line bg-white py-1 text-sm shadow-xl" style={{ left: conversationMenu.x, top: conversationMenu.y }} onClick={(event) => event.stopPropagation()}>
              <button className="block w-full px-4 py-2 text-left hover:bg-paper" onClick={() => toggleConversationPin(conversationMenu.conversationId)} type="button">
                {pinnedConversationIds.has(conversationMenu.conversationId) ? t.unpinConversation : t.pinConversation}
              </button>
              <button className="block w-full px-4 py-2 text-left text-coral hover:bg-paper" onClick={() => deleteConversationFromList(conversationMenu.conversationId)} type="button">
                {t.deleteChat}
              </button>
            </div>
          </div>
        ) : null}        {forwardMessages.length > 0 ? (
          <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => setForwardMessages([])}>
            <div className="mx-auto mt-16 max-h-[72vh] w-full max-w-md overflow-hidden rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{uiLanguage === "zh" ? "转发消息" : "Forward message"}</p>
                  <p className="text-xs text-slate-500">{forwardMessages.length} {uiLanguage === "zh" ? "???" : "messages"}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setForwardMessages([])} type="button">{t.adminClose}</button>
              </div>
              <div className="max-h-[56vh] overflow-auto p-2">
                {filtered.length === 0 ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{t.noConversations}</p> : null}
                {filtered.map((conversation) => (
                  <button key={conversation.id} className="flex w-full items-center gap-3 rounded px-3 py-2 text-left hover:bg-paper" onClick={() => forwardMessageToConversation(conversation)} type="button">
                    <Avatar name={conversation.name} url={conversation.avatarUrl} kind={conversation.type === "group" ? "group" : "user"} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{conversation.name}</span>
                      <span className="block truncate text-xs text-slate-500">{conversation.preview}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
        {mediaLibraryOpen ? (
          <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => setMediaLibraryOpen(false)}>
            <div className="mx-auto mt-10 flex max-h-[82vh] w-full max-w-3xl flex-col rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-line px-4 py-3">
                <p className="font-semibold text-ink">{t.mediaFiles}</p>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setMediaLibraryOpen(false)} type="button">{t.adminClose}</button>
              </div>
              <div className="flex gap-2 border-b border-line px-4 py-3">
                <button className={`rounded border px-3 py-1.5 text-xs font-medium ${mediaLibraryView === "history" ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryView("history")} type="button">{uiLanguage === "zh" ? "历史记录" : "History"}</button>
                <button className={`rounded border px-3 py-1.5 text-xs font-medium ${mediaLibraryView === "files" ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryView("files")} type="button">{uiLanguage === "zh" ? "文件" : "Files"}</button>
              </div>
              {mediaLibraryView === "history" ? (
                <div className="min-h-0 flex-1 overflow-auto p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-48 flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                      <input className="h-9 w-full rounded border border-line bg-white pl-8 pr-3 text-sm outline-none focus:border-brand" placeholder={uiLanguage === "zh" ? "搜索聊天记录" : "Search chat history"} value={messageSearchQuery} onChange={(event) => setMessageSearchQuery(event.target.value)} />
                    </div>
                    <select className="h-9 rounded border border-line bg-white px-2 text-sm outline-none focus:border-brand" value={messageSearchType} onChange={(event) => setMessageSearchType(event.target.value as MessageSearchType)}>
                      {messageSearchTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                    </select>
                    <input className="h-9 rounded border border-line bg-white px-2 text-sm outline-none focus:border-brand" type="date" value={messageSearchDate} onChange={(event) => setMessageSearchDate(event.target.value)} />
                    {messageSearchActive ? <button className="h-9 rounded border border-line px-3 text-sm font-medium text-ink hover:border-brand" type="button" onClick={() => { setMessageSearchQuery(""); setMessageSearchType("all"); setMessageSearchDate(""); }}>{uiLanguage === "zh" ? "清空" : "Clear"}</button> : null}
                  </div>
                  {!messageSearchActive ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{uiLanguage === "zh" ? "输入关键词、日期或类型搜索已加载的聊天记录。" : "Enter a keyword, date, or type to search loaded chat history."}</p> : null}
                  {messageSearchActive && messageSearchResults.length === 0 ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{uiLanguage === "zh" ? "已加载消息中没有匹配结果" : "No matches in loaded messages"}</p> : null}
                  <div className="space-y-2">
                    {messageSearchResults.map((message) => (
                      <button key={message.id} className="w-full rounded border border-line bg-white px-3 py-2 text-left text-sm hover:border-brand hover:bg-paper" type="button" onClick={() => { setMediaLibraryOpen(false); void jumpToMessage(message.id); }}>
                        <span className="block truncate font-medium text-ink">{message.senderName ?? message.type} · {formatMessageTime(message.createdAt) || message.createdAt.slice(0, 10)}</span>
                        <span className="mt-1 block truncate text-slate-500">{mediaPreviewLabel(message) || message.transcript || `[${message.type}]`}</span>
                      </button>
                    ))}
                  </div>
                  {historyCursors[selected.id] ? <button className="mt-4 w-full rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">{historyLoading ? t.loadingOlder : t.mediaLoadOlder}</button> : null}
                </div>
              ) : (
                <>
                  <div className="flex gap-2 overflow-x-auto border-b border-line px-4 py-3">
                    {mediaLibraryFilters.map((item) => (
                      <button key={item.key} className={`shrink-0 rounded border px-3 py-1.5 text-xs font-medium ${mediaLibraryFilter === item.key ? "border-brand bg-brand text-white" : "border-line text-ink hover:border-brand"}`} onClick={() => setMediaLibraryFilter(item.key)} type="button">
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-4">
                    {filteredMediaLibraryMessages.length === 0 ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{t.mediaEmpty}</p> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {filteredMediaLibraryMessages.map((message) => (
                        <div key={message.id} className="rounded border border-line bg-white p-3 text-sm shadow-sm">
                          <button className="flex w-full items-center gap-3 text-left" onClick={() => message.type === "image" || message.type === "video" || message.type === "audio" ? setPreviewMedia({ url: mediaPreviewUrl(message), type: message.type, name: message.body }) : window.open(mediaPreviewUrl(message), "_blank", "noopener,noreferrer")} type="button">
                            {message.type === "image" ? <img className="h-14 w-14 rounded object-cover" src={mediaThumbnailUrl(message)} alt={message.body ?? "Image"} /> : null}
                            {message.type === "video" ? <span className="grid h-14 w-14 place-items-center rounded bg-slate-900 text-white"><FileText size={20} /></span> : null}
                            {message.type === "audio" ? <span className="grid h-14 w-14 place-items-center rounded bg-paper text-ink"><Music2 size={20} /></span> : null}
                            {message.type === "file" ? <span className="grid h-14 w-14 place-items-center rounded bg-paper text-ink"><FileText size={20} /></span> : null}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium text-ink">{message.body ?? mediaPreviewLabel(message)}</span>
                              <span className="mt-1 block text-xs text-slate-500">{formatMessageTime(message.createdAt)}</span>
                            </span>
                          </button>
                          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs"><button className="inline-flex items-center gap-1 text-brand underline-offset-2 hover:underline" onClick={() => locateMediaMessage(message.id)} type="button"><Search size={13} />{t.mediaLocate}</button><a className="inline-flex items-center gap-1 text-slate-500 underline-offset-2 hover:underline" href={mediaDownloadUrl(message)} download={message.body ?? "download"}><Download size={13} />{t.downloadOriginal}</a></div>
                        </div>
                      ))}
                    </div>
                    {historyCursors[selected.id] ? <button className="mt-4 w-full rounded border border-line px-3 py-2 text-sm font-medium text-ink hover:border-brand disabled:opacity-50" disabled={historyLoading} onClick={loadOlderMessages} type="button">{historyLoading ? t.loadingOlder : t.mediaLoadOlder}</button> : null}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : null}

        {archivePreview ? (
          <div className="fixed inset-0 z-50 bg-slate-950/45 p-4" onClick={() => setArchivePreview(null)}>
            <div className="mx-auto mt-10 flex max-h-[82vh] w-full max-w-lg flex-col rounded bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{archivePreview.fileName}</p>
                  <p className="text-xs text-slate-500">{archivePreview.totalEntries} {uiLanguage === "zh" ? "项" : "items"}{archivePreview.truncated ? (uiLanguage === "zh" ? "，显示前 300 项" : ", showing first 300") : ""}</p>
                </div>
                <button className="rounded border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-brand" onClick={() => setArchivePreview(null)} type="button">{t.adminClose}</button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-4">
                {archivePreview.loading ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{t.loadingMessages}</p> : null}
                {archivePreview.error ? <p className="rounded border border-coral/30 bg-coral/10 p-4 text-sm text-coral">{archivePreview.error}</p> : null}
                {!archivePreview.loading && !archivePreview.error && archivePreview.entries.length === 0 ? <p className="rounded border border-line bg-paper p-4 text-sm text-slate-500">{uiLanguage === "zh" ? "压缩包为空" : "Archive is empty"}</p> : null}
                <div className="space-y-2">
                  {archivePreview.entries.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="rounded border border-line px-3 py-2 text-sm">
                      <p className="break-all font-medium text-ink">{entry.directory ? "[dir] " : ""}{entry.name}</p>
                      {!entry.directory ? <p className="mt-1 text-xs text-slate-500">{Math.round(entry.size / 1024)} KB</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {contactDetailsUser ? renderContactDetails(contactDetailsUser) : null}
                {renderGroupDetails()}
        {renderGroupModal()}
        {incomingCall ? (
          <div className="fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded border border-line bg-white p-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <Avatar name={incomingCall.fromName ?? selected.name} url={selected.avatarUrl} kind={selected.type === "group" ? "group" : "user"} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink">{incomingCall.fromName ?? selected.name}</p>
                <p className="text-sm text-slate-500">{incomingCall.media === "video" ? callLabels[uiLanguage].incomingVideo : callLabels[uiLanguage].incomingAudio}</p>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded bg-brand px-3 py-2 text-sm font-medium text-white" onClick={() => void acceptIncomingCall()} type="button">{callLabels[uiLanguage].accept}</button>
              <button className="flex-1 rounded border border-coral px-3 py-2 text-sm font-medium text-coral" onClick={rejectIncomingCall} type="button">{callLabels[uiLanguage].reject}</button>
            </div>
          </div>
        ) : null}
        {activeCall ? (
          <div className={callExpanded ? "fixed inset-0 z-40 flex flex-col overflow-hidden bg-slate-950 text-white" : "fixed bottom-4 right-4 z-40 w-[min(92vw,420px)] overflow-hidden rounded border border-line bg-white shadow-2xl"}>
            <div className={callExpanded ? "flex items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 py-3 text-white" : "flex items-center justify-between gap-3 border-b border-line px-4 py-3"}>
              <div className="min-w-0">
                <p className={callExpanded ? "truncate text-lg font-semibold text-white" : "truncate font-semibold text-ink"}>{activeCall.peerName}</p>
                <p className={callExpanded ? "text-sm text-white/65" : "text-sm text-slate-500"}>{activeCall.status === "ringing" ? callLabels[uiLanguage].calling : activeCall.status === "connecting" ? callLabels[uiLanguage].connecting : callLabels[uiLanguage].inCall}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button className={callExpanded ? "grid h-9 w-9 place-items-center rounded-full border border-white/20 text-white" : "grid h-9 w-9 place-items-center rounded-full border border-line text-ink"} onClick={() => setCallExpanded((value) => !value)} type="button" aria-label={callExpanded ? (uiLanguage === "zh" ? "退出全屏" : "Exit full screen") : (uiLanguage === "zh" ? "全屏" : "Full screen")} title={callExpanded ? (uiLanguage === "zh" ? "退出全屏" : "Exit full screen") : (uiLanguage === "zh" ? "全屏" : "Full screen")}>
                  {callExpanded ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
                </button>
                <button className="grid h-9 w-9 place-items-center rounded-full bg-coral text-white" onClick={() => endActiveCall(true)} type="button" aria-label={callLabels[uiLanguage].end} title={callLabels[uiLanguage].end}><PhoneOff size={17} /></button>
              </div>
            </div>
            {callExpanded ? (
              <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-950 p-2">
                <div className="h-full min-h-0">
                  {focusedCallTile ? <CallVideoTile {...focusedCallTile} expanded={true} focused={true} avatarUrl={focusedCallTile.avatarUrl} /> : null}
                </div>
                {floatingCallTile ? (
                  <div
                    className="absolute left-0 top-0 z-10 touch-none select-none overflow-hidden rounded border border-white/25 bg-slate-900 shadow-2xl"
                    style={{ width: callPipSize.width, height: callPipSize.height, transform: `translate(${callPipPosition.x}px, ${callPipPosition.y}px)` }}
                    onPointerDown={beginCallPipDrag}
                    onPointerMove={moveCallPip}
                    onPointerUp={endCallPipDrag}
                    onPointerCancel={endCallPipDrag}
                  >
                    <CallVideoTile
                      {...floatingCallTile}
                      compact={true}
                      avatarUrl={floatingCallTile.avatarUrl}
                      onClick={() => {
                        if (callPipSuppressClickRef.current) {
                          callPipSuppressClickRef.current = false;
                          return;
                        }
                        setFocusedCallTileId(floatingCallTile.id);
                      }}
                    />
                    <div
                      className="absolute bottom-1 right-1 h-5 w-5 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-white/80 bg-black/20"
                      onPointerDown={beginCallPipResize}
                      onPointerMove={moveCallPipResize}
                      onPointerUp={endCallPipResize}
                      onPointerCancel={endCallPipResize}
                      aria-hidden="true"
                    />
                  </div>
                ) : null}
                {remoteCallStreams.length === 0 ? <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded bg-black/45 px-3 py-2 text-center text-sm text-white/70">{callLabels[uiLanguage].noRemote}</div> : null}
              </div>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-auto bg-slate-950 p-2">
                {callTiles.map((tile) => <CallVideoTile key={tile.id} {...tile} avatarUrl={tile.avatarUrl} onClick={() => setFocusedCallTileId(tile.id)} />)}
                {remoteCallStreams.length === 0 ? <div className="grid min-h-28 place-items-center rounded bg-slate-900 px-3 text-center text-sm text-white/70">{callLabels[uiLanguage].noRemote}</div> : null}
              </div>
            )}
            {callError ? <p className={callExpanded ? "border-t border-white/10 bg-slate-950 px-4 py-2 text-sm text-coral" : "border-t border-line px-4 py-2 text-sm text-coral"}>{callError}</p> : null}
            <div className={callExpanded ? "absolute inset-x-0 bottom-6 z-20 flex flex-wrap items-center justify-center gap-3 px-4" : "flex flex-wrap items-center justify-center gap-3 border-t border-line px-4 py-3"}>
              <button className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-medium shadow-lg ${activeCall.muted ? "border-coral bg-coral text-white" : callExpanded ? "border-white/20 bg-black/45 text-white" : "border-line bg-white text-ink"}`} onClick={toggleCallMute} type="button" title={activeCall.muted ? callLabels[uiLanguage].unmute : callLabels[uiLanguage].mute} aria-label={activeCall.muted ? callLabels[uiLanguage].unmute : callLabels[uiLanguage].mute}>
                {activeCall.muted ? <MicOff size={19} /> : <Mic size={19} />}
              </button>
              {activeCall.media === "video" ? (
                <>
                  <button className={`grid h-12 w-12 place-items-center rounded-full border text-sm font-medium shadow-lg ${activeCall.cameraOff ? "border-coral bg-coral text-white" : callExpanded ? "border-white/20 bg-black/45 text-white" : "border-line bg-white text-ink"}`} onClick={toggleCallCamera} type="button" title={activeCall.cameraOff ? callLabels[uiLanguage].cameraOn : callLabels[uiLanguage].cameraOff} aria-label={activeCall.cameraOff ? callLabels[uiLanguage].cameraOn : callLabels[uiLanguage].cameraOff}>
                    {activeCall.cameraOff ? <VideoOff size={19} /> : <Video size={19} />}
                  </button>
                  <button className={callExpanded ? "grid h-12 w-12 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-lg" : "grid h-12 w-12 place-items-center rounded-full border border-line bg-white text-ink shadow-lg"} onClick={() => void switchCallCamera()} type="button" title={uiLanguage === "zh" ? "切换摄像头" : "Switch camera"} aria-label={uiLanguage === "zh" ? "切换摄像头" : "Switch camera"}>
                    <RefreshCw size={19} />
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}      {previewMedia ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setPreviewMedia(null)}>
            <div className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-center justify-center gap-2">
              {(previewMedia.type === "image" || previewMedia.type === "avatar" || previewMedia.type === "video") ? (
                <>
                  <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewRotation((value) => (value + 270) % 360); }} type="button" aria-label={t.rotateLeft}><RotateCcw size={16} />{t.rotateLeft}</button>
                  <button className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewRotation((value) => (value + 90) % 360); }} type="button" aria-label={t.rotateRight}><RotateCw size={16} />{t.rotateRight}</button>
                </>
              ) : null}
              {previewMedia.type === "pdf" && previewMedia.downloadUrl ? <a className="inline-flex items-center gap-1 rounded bg-white px-3 py-2 text-sm font-medium text-ink shadow-lg" href={previewMedia.downloadUrl} download={previewMedia.name ?? "download.pdf"} onClick={(event) => event.stopPropagation()}><Download size={16} />{t.downloadOriginal}</a> : null}
              <button className="rounded bg-white px-4 py-2 text-sm font-medium text-ink shadow-lg" onClick={(event) => { event.stopPropagation(); setPreviewMedia(null); }} type="button">{t.mediaClose}</button>
            </div>
            <div className={previewMedia.type === "pdf" ? "h-[calc(100vh-6rem)] w-[min(96vw,1200px)] pt-10" : "max-h-full max-w-5xl"} onClick={(event) => event.stopPropagation()}>
              {previewMedia.type === "image" || previewMedia.type === "avatar" ? <img className={`${previewRotationClass} rounded bg-black object-contain`} src={previewMedia.url} alt={previewMedia.name ?? "Image preview"} style={{ transform: `rotate(${previewRotation}deg)` }} /> : null}
              {previewMedia.type === "video" ? (
                <video
                  className={`block h-auto ${previewRotationClass} rounded bg-black object-contain`}
                  src={previewMedia.url}
                  controls
                  muted={previewMedia.muted}
                  autoPlay
                  playsInline
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    if (video.videoWidth > 0 && video.videoHeight > 0) {
                      setPreviewVideoSize({ width: video.videoWidth, height: video.videoHeight });
                    }
                  }}
                  style={{ transform: `rotate(${previewRotation}deg)`, transformOrigin: "center center" }}
                />
              ) : null}
              {previewMedia.type === "audio" ? <div className="rounded bg-white p-4"><p className="mb-3 text-sm font-medium text-ink">{previewMedia.name ?? "Audio"}</p><audio className="w-full" src={previewMedia.url} controls autoPlay /></div> : null}
              {previewMedia.type === "pdf" ? <iframe className="h-full w-full rounded bg-white shadow-2xl" src={previewMedia.url} title={previewMedia.name ?? "PDF preview"} /> : null}
            </div>
          </div>
        ) : null}      </div>
    </main>
  );
}

function CallVideoTile({ name, stream, muted, videoEnabled, expanded = false, focused = false, compact = false, avatarUrl, onClick }: CallTileView & { expanded?: boolean; focused?: boolean; compact?: boolean; onClick?: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const normalizedAvatarUrl = normalizeMediaUrl(avatarUrl ?? undefined);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const hasVideo = Boolean(stream && videoEnabled && stream.getVideoTracks().length > 0);
  useEffect(() => setAvatarFailed(false), [normalizedAvatarUrl]);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = hasVideo ? stream : null;
      if (hasVideo) void videoRef.current.play().catch(() => undefined);
    }
    if (audioRef.current) {
      audioRef.current.srcObject = !muted && !hasVideo ? stream : null;
      if (!muted && !hasVideo && stream) void audioRef.current.play().catch(() => undefined);
    }
  }, [hasVideo, muted, stream]);
  const initials = name.trim().slice(0, 2).toUpperCase() || "U";
  const tileClass = focused
    ? "relative grid h-full min-h-0 w-full place-items-center overflow-hidden rounded bg-slate-900 text-white"
    : compact
      ? "relative grid h-full w-full place-items-center overflow-hidden rounded bg-slate-900 text-white"
      : expanded
        ? "relative grid min-h-48 place-items-center overflow-hidden rounded bg-slate-900 text-white md:min-h-0"
        : "relative grid min-h-28 place-items-center overflow-hidden rounded bg-slate-900 text-white";
  const avatarClass = focused
    ? "h-28 w-28 text-3xl"
    : compact
      ? "h-16 w-16 text-base"
      : expanded
        ? "h-24 w-24 text-2xl"
        : "h-14 w-14 text-sm";
  return (
    <button className={`${tileClass} ${onClick ? "cursor-pointer" : ""}`} onClick={onClick} type="button">
      {hasVideo ? <video ref={videoRef} className={expanded || focused ? "h-full max-h-full w-full object-contain" : "h-full w-full object-cover"} autoPlay playsInline muted={muted} /> : (
        <div className={`${avatarClass} grid place-items-center overflow-hidden rounded-full bg-brand font-semibold text-white`}>
          {normalizedAvatarUrl && !avatarFailed ? <img className="h-full w-full object-cover" src={normalizedAvatarUrl} alt={name} onError={() => setAvatarFailed(true)} /> : initials}
        </div>
      )}
      {!muted ? <audio ref={audioRef} autoPlay playsInline /> : null}
      <span className="absolute bottom-2 left-2 max-w-[80%] truncate rounded bg-black/60 px-2 py-1 text-xs">{name}</span>
    </button>
  );
}
function OnlineDot({ online, size = "sm", className = "" }: { online: boolean; size?: "xs" | "sm" | "md"; className?: string }) {
  const sizeClass = size === "xs" ? "h-2 w-2" : size === "md" ? "h-3 w-3" : "h-2.5 w-2.5";
  return <span aria-label={online ? "online" : "offline"} title={online ? "Online" : "Offline"} className={`${sizeClass} shrink-0 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"} ${className}`} />;
}
function TabButton({ active, icon, label, onClick, onDoubleClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void; onDoubleClick?: () => void }) {
  return (
    <button className={`flex h-12 items-center justify-center gap-2 border-b-2 ${active ? "border-brand font-medium text-brand" : "border-transparent text-slate-600 hover:text-ink"}`} onClick={onClick} onDoubleClick={onDoubleClick}>
      {icon}
      {label}
    </button>
  );
}

function Avatar({ name, url, size = "md", kind = "user", online }: { name: string; url?: string | null; size?: "sm" | "md" | "lg"; kind?: "user" | "group"; online?: boolean }) {
  const initials = name.trim().slice(0, 2).toUpperCase() || "U";
  const normalizedUrl = normalizeMediaUrl(url ?? undefined);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [normalizedUrl]);
  const sizeClass = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-16 w-16 text-lg" : "h-11 w-11 text-sm";
  const badgeSizeClass = size === "sm" ? "h-3.5 w-3.5" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const badgeIconSize = size === "sm" ? 9 : size === "lg" ? 13 : 10;
  const hasImage = Boolean(normalizedUrl && !imageFailed);
  const onlineDotSizeClass = size === "sm" ? "h-2.5 w-2.5" : size === "lg" ? "h-4 w-4" : "h-3 w-3";
  return (
    <div className={`relative grid ${sizeClass} shrink-0 place-items-center overflow-hidden rounded ${kind === "group" ? "bg-emerald-700" : "bg-brand"} font-semibold text-white`}>
      {hasImage ? <img className="h-full w-full object-cover" src={normalizedUrl} alt={name} onError={() => setImageFailed(true)} /> : kind === "group" ? <Users size={size === "sm" ? 16 : size === "lg" ? 28 : 20} /> : initials}
      {kind === "group" && hasImage ? <span className={`absolute left-0.5 top-0.5 grid ${badgeSizeClass} place-items-center rounded-sm bg-white/75 text-emerald-800 ring-1 ring-black/10 backdrop-blur-sm`}><Users size={badgeIconSize} /></span> : null}
      {kind === "user" && typeof online === "boolean" ? <span aria-label={online ? "online" : "offline"} title={online ? "Online" : "Offline"} className={`absolute bottom-0.5 right-0.5 ${onlineDotSizeClass} rounded-full ring-2 ring-white ${online ? "bg-emerald-500" : "bg-slate-300"}`} /> : null}
    </div>
  );
}

function BlockToggle({ checked }: { checked: boolean }) {
  return (
    <span aria-hidden="true" className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-coral" : "bg-slate-300"}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </span>
  );
}
function UnreadBadge({ count }: { count: number }) {
  return <span className="grid h-6 min-w-6 place-items-center rounded-full bg-coral px-2 text-xs font-semibold text-white">{count}</span>;
}




















































































































































