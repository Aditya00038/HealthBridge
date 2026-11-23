import React, { useState, useRef, useEffect } from 'react';
import { 
  PaperAirplaneIcon, 
  MapPinIcon,
  ClipboardDocumentCheckIcon,
  ClipboardDocumentIcon
} from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { sendGroqChatMessage } from '@/services/groqChatService';

const AIAssistantPro = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedCity] = useState('pune');
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activeModel, setActiveModel] = useState('Groq AI (GPT-OSS / Llama 3)');
  
  const chatContainerRef = useRef(null);
  const inputRef = useRef(null);

  // Initialize welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        type: 'ai',
        content: `**HealthBridge AI Medical Assistant**\n\nHello! I provide quick medical answers, first-aid advice, and nearby healthcare info. How can I assist you today?`,
        timestamp: new Date().toISOString()
      }]);
    }
  }, []);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || isLoading) return;

    // Append user message
    const userMessage = {
      type: 'user',
      content: query,
      timestamp: new Date().toISOString()
    };

    const updatedHistory = [...messages, userMessage];
    setMessages(updatedHistory);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Send conversation history to Groq API
      const groqConversation = updatedHistory
        .filter(m => m.type === 'user' || m.type === 'ai')
        .map(m => ({
          role: m.type === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      const res = await sendGroqChatMessage(groqConversation, { city: selectedCity });

      if (res.model) {
        setActiveModel(res.model);
      }

      const aiMessage = {
        type: 'ai',
        content: res.response,
        timestamp: res.timestamp || new Date().toISOString(),
        model: res.model
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('Chat error:', err);
      toast.error('Could not complete request. Showing offline health guidance.');
      const fallbackMsg = {
        type: 'ai',
        content: `## Connection Notice\n\nI was unable to reach the Groq AI service. For immediate healthcare assistance, please visit our **[Locate Hospitals Page](/locate)** to explore nearby hospitals and clinics with real-time Leaflet maps.\n\n*Emergency Helpline:* **112 / 102**`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomMessage = (e) => {
    e.preventDefault();
    handleSendMessage(inputMessage);
  };

  const handleClearChat = () => {
    setMessages([{
      type: 'ai',
      content: `## Chat Reset\n\nHow can I help you today? You can ask about any health symptoms, medications, or ask for **nearby hospitals and healthcare facilities** in ${selectedCity.toUpperCase()}.`,
      timestamp: new Date().toISOString()
    }]);
    toast.success('Conversation cleared');
  };

  const handleCopy = (content, index) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-slate-50 to-emerald-50 py-4 sm:py-6">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        
        {/* Main Chat Box */}
        <div className="flex flex-col bg-white rounded-2xl shadow-sm border border-gray-200 h-[740px] overflow-hidden">
          
          {/* Chat Messages Scroll Area */}
          <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            {messages.map((message, idx) => {
                const isUser = message.type === 'user';
                const hasHospitalMention = !isUser && (
                  message.content.toLowerCase().includes('hospital') ||
                  message.content.toLowerCase().includes('/locate') ||
                  message.content.toLowerCase().includes('clinic') ||
                  message.content.toLowerCase().includes('emergency')
                );

                return (
                  <div
                    key={idx}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3.5 sm:px-5 sm:py-4 relative group ${
                        isUser
                          ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-sm'
                          : 'bg-slate-50 text-slate-800 border border-slate-200 shadow-sm'
                      }`}
                    >
                      {/* Message Content */}
                      <div className={`prose prose-sm max-w-none text-sm leading-relaxed ${
                        isUser ? 'text-white prose-invert' : 'text-slate-800 prose-headings:text-teal-900 prose-strong:text-slate-900 prose-a:text-teal-600'
                      }`}>
                        <ReactMarkdown>
                          {message.content}
                        </ReactMarkdown>
                      </div>

                      {/* Nearby Hospital Quick Action if response relates to hospitals */}
                      {hasHospitalMention && (
                        <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between">
                          <span className="text-[11px] font-medium text-teal-800 flex items-center gap-1">
                            <MapPinIcon className="w-3.5 h-3.5 text-teal-600" />
                            View mapped healthcare centers
                          </span>
                          <button
                            onClick={() => navigate('/locate')}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-bold shadow-sm transition-all flex items-center gap-1"
                          >
                            <span>Open in Map</span>
                            <span>→</span>
                          </button>
                        </div>
                      )}

                      {/* Footer: timestamp + copy */}
                      <div className={`flex items-center justify-between mt-2 pt-1 text-[10px] ${
                        isUser ? 'text-teal-100' : 'text-slate-400'
                      }`}>
                        <span>
                          {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>

                        {!isUser && (
                          <button
                            onClick={() => handleCopy(message.content, idx)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-teal-600 p-0.5"
                            title="Copy response"
                          >
                            {copiedIndex === idx ? (
                              <ClipboardDocumentCheckIcon className="w-3.5 h-3.5 text-teal-600" />
                            ) : (
                              <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl px-5 py-3.5 shadow-sm">
                    <div className="flex items-center gap-2 text-xs text-teal-700 font-medium">
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce"></div>
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }}></div>
                        <div className="w-2 h-2 bg-teal-500 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }}></div>
                      </div>
                      <span className="ml-1">HealthBridge AI is thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Input Area */}
            <div className="border-t border-gray-200 p-3 sm:p-4 bg-slate-50/60">
              <form onSubmit={handleCustomMessage} className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask a health question or describe symptoms..."
                  disabled={isLoading}
                  className="flex-1 px-4 py-3 bg-white text-sm text-gray-900 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 placeholder-gray-400 font-medium shadow-inner"
                />

                <button
                  type="submit"
                  disabled={isLoading || !inputMessage.trim()}
                  className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white p-3 rounded-xl hover:from-teal-700 hover:to-emerald-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:shadow-lg flex items-center justify-center flex-shrink-0"
                  title="Send Message"
                >
                  <PaperAirplaneIcon className="w-5 h-5" />
                </button>
              </form>

              <div className="flex items-center justify-end mt-2 px-1 text-[11px] text-gray-400">
                <button
                  type="button"
                  onClick={handleClearChat}
                  className="hover:text-gray-600 transition-colors underline"
                >
                  Clear Chat
                </button>
              </div>
            </div>

          </div>

      </div>
    </div>
  );
};

export default AIAssistantPro;
