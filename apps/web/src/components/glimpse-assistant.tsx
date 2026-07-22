"use client";

import { Bot, Download, FileText, Film, Image as ImageIcon, Paperclip, Send, Share2, Trash2, X } from "lucide-react";
import NextImage from "next/image";
import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { UploadedMediaResponse } from "@glimpse/shared";

type UiLanguage = "zh" | "en" | "hi";
type AttachmentKind = "image" | "video" | "file";
type AssistantMessage = { id: string; role: "user" | "assistant"; content: string; fileName?: string; attachmentKind?: AttachmentKind; previewUrl?: string; model?: string; generatedFile?: UploadedMediaResponse; sentToChat?: boolean };
type AssistantReply = { answer: string; model: string; fileName: string | null; generatedFile?: UploadedMediaResponse; autoSendRequested?: boolean };

const copy = {
  zh: { title: "Glimpse 智能助手", subtitle: "回复语言跟随你当前输入的语言", hello: "你好！我可以回答问题、翻译文件、识别图片，也可以直接生成 DOC、DOCX、PDF、XLSX 等文件。", placeholder: "输入消息，或附加文件并说明要执行的操作…", attach: "添加文件", send: "发送", working: "正在处理…", clear: "清空对话", close: "关闭", tooLarge: "文件不能超过 20 MB。", failed: "智能助手暂时无法回答，请稍后重试。", fileReady: "已选择文件", downloadFile: "下载文件", downloadFailed: "文件下载失败，请检查网络后重试。", sendToChat: "发送到当前聊天", sentToChat: "已发送到当前聊天", noConversation: "请先选择一个聊天会话。", prompts: ["生成一份 PDF 文件", "生成一份 DOC 文件", "翻译成中文并生成 DOCX", "识别图片中的文字（OCR）", "总结文件"] },
  en: { title: "Glimpse Assistant", subtitle: "Replies follow the language of your current message", hello: "Hello! I can answer questions, translate files, read images, and directly create DOC, DOCX, PDF, or XLSX files.", placeholder: "Type a message, or attach a file and describe the task…", attach: "Attach file", send: "Send", working: "Working…", clear: "Clear chat", close: "Close", tooLarge: "Files must be 20 MB or smaller.", failed: "The assistant could not answer right now. Please try again.", fileReady: "File attached", downloadFile: "Download file", downloadFailed: "Could not download the file. Check the network and try again.", sendToChat: "Send to current chat", sentToChat: "Sent to current chat", noConversation: "Select a conversation first.", prompts: ["Create a PDF file", "Create a DOC file", "Translate and create a DOCX", "Extract text from image (OCR)", "Summarize the file"] },
  hi: { title: "Glimpse सहायक", subtitle: "उत्तर आपके वर्तमान संदेश की भाषा में होगा", hello: "नमस्ते! मैं प्रश्नों के उत्तर, फ़ाइल अनुवाद, चित्र OCR और DOC, DOCX, PDF या XLSX फ़ाइल बना सकता हूँ।", placeholder: "संदेश लिखें, या फ़ाइल जोड़कर कार्य बताएं…", attach: "फ़ाइल जोड़ें", send: "भेजें", working: "प्रक्रिया जारी है…", clear: "चैट साफ़ करें", close: "बंद करें", tooLarge: "फ़ाइल 20 MB या उससे छोटी होनी चाहिए।", failed: "सहायक अभी उत्तर नहीं दे सका। कृपया फिर प्रयास करें।", fileReady: "फ़ाइल जोड़ दी गई", downloadFile: "फ़ाइल डाउनलोड करें", downloadFailed: "फ़ाइल डाउनलोड नहीं हुई। नेटवर्क जांचकर फिर प्रयास करें।", sendToChat: "वर्तमान चैट में भेजें", sentToChat: "वर्तमान चैट में भेज दिया", noConversation: "पहले कोई चैट चुनें।", prompts: ["PDF फ़ाइल बनाएं", "DOC फ़ाइल बनाएं", "अनुवाद करके DOCX बनाएं", "चित्र से पाठ निकालें (OCR)", "फ़ाइल का सारांश दें"] }
} as const;

function attachmentKind(file: File): AttachmentKind {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp"].includes(extension || "")) return "image";
  if (["mp4", "mov", "avi", "mkv", "flv", "wmv"].includes(extension || "")) return "video";
  return "file";
}

function fileAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function GlimpseAssistant({ open, onClose, apiUrl, accessToken, userId, uiLanguage, onSendGeneratedFile }: { open: boolean; onClose: () => void; apiUrl: string; accessToken: string; userId: string; uiLanguage: UiLanguage; onSendGeneratedFile?: (file: UploadedMediaResponse) => Promise<boolean> }) {
  const t = copy[uiLanguage];
  const storageKey = `glimpse.assistant.messages.${userId}`;
  const [mounted, setMounted] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sendingFileId, setSendingFileId] = useState("");
  const [downloadingFileId, setDownloadingFileId] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || "[]"); if (Array.isArray(saved)) setMessages(saved.slice(-50)); } catch { setMessages([]); }
  }, [storageKey]);
  useEffect(() => { if (mounted) { try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-50).map((message) => { const stored = { ...message }; delete stored.previewUrl; return stored; }))); } catch {} } }, [messages, mounted, storageKey]);
  useEffect(() => { if (open) window.setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 0); }, [messages, loading, open]);
  useEffect(() => {
    if (!open || document.documentElement.dataset.glimpseClient !== "android-app") return;

    const visualViewport = window.visualViewport;
    let animationFrame = 0;
    const updateVisibleViewport = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(() => {
        const viewportHeight = Math.max(1, Math.round(visualViewport?.height ?? window.innerHeight));
        const viewportTop = Math.max(0, Math.round(visualViewport?.offsetTop ?? 0));
        dialog.current?.style.setProperty("--glimpse-assistant-visible-height", `${viewportHeight}px`);
        dialog.current?.style.setProperty("--glimpse-assistant-visible-top", `${viewportTop}px`);
      });
    };

    updateVisibleViewport();
    visualViewport?.addEventListener("resize", updateVisibleViewport);
    visualViewport?.addEventListener("scroll", updateVisibleViewport);
    window.addEventListener("resize", updateVisibleViewport);
    window.addEventListener("orientationchange", updateVisibleViewport);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      visualViewport?.removeEventListener("resize", updateVisibleViewport);
      visualViewport?.removeEventListener("scroll", updateVisibleViewport);
      window.removeEventListener("resize", updateVisibleViewport);
      window.removeEventListener("orientationchange", updateVisibleViewport);
    };
  }, [open]);

  async function send(event?: FormEvent, promptOverride?: string) {
    event?.preventDefault();
    const prompt = (promptOverride ?? draft).trim();
    if (loading || (!prompt && !file)) return;
    setLoading(true); setError("");
    const userMessage: AssistantMessage = { id: crypto.randomUUID(), role: "user", content: prompt, ...(file ? { fileName: file.name, attachmentKind: attachmentKind(file), previewUrl: filePreview } : {}) };
    const history = messages.map((item) => ({ role: item.role, content: item.content }));
    setMessages((items) => [...items, userMessage]); setDraft("");
    const attached = file; setFile(null); setFilePreview("");
    try {
      const encoded = attached ? await fileAsBase64(attached) : null;
      const response = await fetch(`${apiUrl}/assistant/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ messages: history, prompt, file: attached ? { name: attached.name, mimeType: attached.type, dataBase64: encoded } : null }) });
      const responseText = await response.text();
      let data: AssistantReply & { message?: string | string[] };
      try { data = JSON.parse(responseText) as AssistantReply & { message?: string | string[] }; }
      catch { data = {} as AssistantReply & { message?: string | string[] }; }
      if (!response.ok) {
        const serviceMessage = Array.isArray(data.message) ? data.message.join(" ") : data.message;
        throw new Error(serviceMessage || `${t.failed} (HTTP ${response.status})`);
      }
      if (!data.answer) throw new Error(`${t.failed} (empty response)`);
      const assistantMessage: AssistantMessage = { id: crypto.randomUUID(), role: "assistant", content: data.answer, model: data.model, generatedFile: data.generatedFile };
      if (data.generatedFile && data.autoSendRequested && onSendGeneratedFile) {
        assistantMessage.sentToChat = await onSendGeneratedFile(data.generatedFile);
        if (!assistantMessage.sentToChat) setError(t.noConversation);
      }
      setMessages((items) => [...items, assistantMessage]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.failed); }
    finally { setLoading(false); }
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
  }

  function chooseFile(selected: File | null) {
    if (filePreview) URL.revokeObjectURL(filePreview);
    if (selected && selected.size > 20 * 1024 * 1024) { setFile(null); setFilePreview(""); setError(t.tooLarge); return; }
    setFile(selected);
    setFilePreview(selected && attachmentKind(selected) !== "file" ? URL.createObjectURL(selected) : "");
    setError("");
  }

  function attachmentPreview(message: AssistantMessage) {
    if (message.attachmentKind === "image" && message.previewUrl) return <NextImage unoptimized src={message.previewUrl} alt={message.fileName || "Attached image"} width={560} height={360} className="mb-2 max-h-72 w-full rounded-2xl object-contain" />;
    if (message.attachmentKind === "video" && message.previewUrl) return <video className="mb-2 max-h-72 w-full rounded-2xl bg-black" controls preload="metadata" src={message.previewUrl} />;
    return null;
  }

  function attachmentIcon(kind?: AttachmentKind) {
    if (kind === "image") return <ImageIcon size={14} />;
    if (kind === "video") return <Film size={14} />;
    return <FileText size={14} />;
  }

  function generatedFileUrl(file: UploadedMediaResponse, forceDownload = false) {
    try {
      const base = typeof window !== "undefined" ? window.location.origin : apiUrl || "http://localhost";
      const parsed = new URL(file.url, base);
      if (typeof window !== "undefined" && parsed.pathname.startsWith("/media/")) {
        parsed.protocol = window.location.protocol;
        parsed.hostname = window.location.hostname;
        parsed.port = window.location.port;
      }
      if (file.fileName) parsed.searchParams.set("name", file.fileName);
      if (forceDownload) parsed.searchParams.set("download", "1");
      return parsed.toString();
    } catch {
      const url = `${apiUrl || ""}${file.url.startsWith("/") ? file.url : `/${file.url}`}`;
      return forceDownload ? `${url}${url.includes("?") ? "&" : "?"}download=1` : url;
    }
  }

  async function sendGeneratedFile(message: AssistantMessage) {
    if (!message.generatedFile || !onSendGeneratedFile || sendingFileId) return;
    setSendingFileId(message.id); setError("");
    try {
      const sent = await onSendGeneratedFile(message.generatedFile);
      if (!sent) { setError(t.noConversation); return; }
      setMessages((items) => items.map((item) => item.id === message.id ? { ...item, sentToChat: true } : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t.failed); }
    finally { setSendingFileId(""); }
  }

  async function downloadGeneratedFile(message: AssistantMessage) {
    if (!message.generatedFile || downloadingFileId) return;
    setDownloadingFileId(message.id); setError("");
    try {
      const response = await fetch(generatedFileUrl(message.generatedFile), { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error(`${t.downloadFailed} (HTTP ${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error(t.downloadFailed);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = message.generatedFile.fileName || "glimpse-assistant-file";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t.downloadFailed);
    } finally {
      setDownloadingFileId("");
    }
  }

  if (!mounted || !open) return null;
  return createPortal(
    <div ref={dialog} className="glimpse-assistant-dialog fixed inset-0 z-[170] flex bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true" aria-label={t.title}>
      <section className="glimpse-assistant-panel flex h-full w-full flex-col overflow-hidden bg-paper shadow-2xl sm:h-[min(820px,92vh)] sm:max-w-3xl sm:rounded-[30px] sm:border sm:border-white/60">
        <header className="glimpse-assistant-header flex shrink-0 items-center gap-3 border-b border-line bg-white px-4 py-3 sm:px-5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-600 to-cyan-500 text-white shadow"><Bot size={23} /></span>
          <div className="min-w-0 flex-1"><h2 className="font-semibold text-ink">{t.title}</h2><p className="truncate text-xs text-slate-500">{t.subtitle}</p></div>
          <button className="grid h-10 w-10 place-items-center rounded-2xl text-slate-500 hover:bg-paper hover:text-ink" onClick={() => { if (confirm(t.clear)) { messages.forEach((message) => { if (message.previewUrl) URL.revokeObjectURL(message.previewUrl); }); setMessages([]); } }} title={t.clear} type="button"><Trash2 size={18} /></button>
          <button className="grid h-10 w-10 place-items-center rounded-2xl text-slate-500 hover:bg-paper hover:text-ink" onClick={onClose} title={t.close} type="button"><X size={20} /></button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
          {messages.length === 0 ? <div className="mx-auto mt-8 max-w-md rounded-3xl border border-brand/15 bg-white p-5 text-center text-sm text-slate-600 shadow-sm"><Bot className="mx-auto mb-3 text-brand" size={30} /><p>{t.hello}</p></div> : null}
          {messages.map((message) => <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[88%] whitespace-pre-wrap rounded-3xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "rounded-br-lg bg-brand text-white" : "rounded-bl-lg border border-line bg-white text-ink"}`}>{attachmentPreview(message)}{message.fileName ? <span className={`flex items-center gap-2 rounded-xl px-2 py-1 text-xs ${message.content ? "mb-2" : ""} ${message.role === "user" ? "bg-white/15" : "bg-paper"}`}>{attachmentIcon(message.attachmentKind)}{message.fileName}</span> : null}{message.content}{message.generatedFile ? <div className="mt-3 rounded-2xl border border-brand/20 bg-brand/5 p-3 text-xs"><div className="flex items-center gap-2 font-semibold text-ink"><FileText size={16} /><span className="min-w-0 flex-1 truncate">{message.generatedFile.fileName}</span><span className="text-slate-400">{Math.max(1, Math.round(message.generatedFile.size / 1024))} KB</span></div><div className="mt-2 flex flex-wrap gap-2"><button className="inline-flex items-center gap-1 rounded-xl border border-line bg-white px-3 py-1.5 font-medium text-ink hover:border-brand disabled:opacity-50" disabled={downloadingFileId === message.id} onClick={() => void downloadGeneratedFile(message)} type="button"><Download size={14} />{t.downloadFile}</button><button className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 font-medium text-white disabled:opacity-50" disabled={message.sentToChat || sendingFileId === message.id || !onSendGeneratedFile} onClick={() => void sendGeneratedFile(message)} type="button"><Share2 size={14} />{message.sentToChat ? t.sentToChat : t.sendToChat}</button></div></div> : null}</div></div>)}
          {loading ? <div className="flex justify-start"><div className="rounded-3xl rounded-bl-lg border border-line bg-white px-4 py-3 text-sm text-slate-500 shadow-sm"><span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-brand" />{t.working}</div></div> : null}
          {error ? <p className="rounded-2xl border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral" role="alert">{error}</p> : null}<div ref={bottom} />
        </div>
        <form className="glimpse-assistant-composer shrink-0 border-t border-line bg-white p-3 sm:p-4" onSubmit={(event) => void send(event)}>
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">{t.prompts.map((prompt, index) => <button key={prompt} className="shrink-0 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand" onClick={() => index < 2 ? void send(undefined, `${prompt}${uiLanguage === "zh" ? "，生成后直接发送到当前聊天。" : uiLanguage === "hi" ? " और बनने के बाद वर्तमान चैट में सीधे भेजें।" : " and send it directly to the current chat when ready."}`) : setDraft(prompt)} type="button">{prompt}{index < 2 ? uiLanguage === "zh" ? " · 直接发送" : uiLanguage === "hi" ? " · सीधे भेजें" : " · Send now" : ""}</button>)}</div>
          {file ? <div className="mb-2 flex items-center gap-3 rounded-2xl border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-brand">{attachmentKind(file) === "image" && filePreview ? <NextImage unoptimized src={filePreview} alt={file.name} width={48} height={48} className="h-12 w-12 rounded-xl object-cover" /> : attachmentKind(file) === "video" && filePreview ? <video className="h-12 w-16 rounded-xl bg-black object-cover" muted preload="metadata" src={filePreview} /> : <FileText size={18} />}<span className="min-w-0 flex-1 truncate">{t.fileReady}: {file.name}</span><button onClick={() => chooseFile(null)} type="button"><X size={15} /></button></div> : null}
          <div className="flex items-end gap-2 rounded-3xl border border-line bg-paper/60 p-2 focus-within:border-brand">
            <input ref={fileInput} className="hidden" type="file" accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.epub,.mobi,.png,.jpg,.jpeg,.gif,.bmp,.webp,.mp4,.mov,.avi,.mkv,.flv,.wmv" onChange={(event) => { const selected = event.target.files?.[0] ?? null; event.target.value = ""; chooseFile(selected); }} />
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-slate-500 hover:bg-white hover:text-brand" onClick={() => fileInput.current?.click()} title={t.attach} type="button"><Paperclip size={19} /></button>
            <textarea className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-ink outline-none" rows={1} placeholder={t.placeholder} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={keyDown} />
            <button className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-brand text-white shadow-sm hover:bg-teal-800 disabled:opacity-50" disabled={loading || (!draft.trim() && !file)} title={t.send} type="submit"><Send size={18} /></button>
          </div>
        </form>
      </section>
    </div>, document.body
  );
}
