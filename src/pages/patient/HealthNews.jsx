import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  NewspaperIcon,
  MagnifyingGlassIcon,
  ArrowTopRightOnSquareIcon,
  ArrowPathIcon,
  ClockIcon,
  CalendarIcon,
  GlobeAltIcon,
  BuildingOffice2Icon,
  HeartIcon,
  ShieldCheckIcon,
  ShareIcon,
  CheckIcon,
  XMarkIcon,
  PhoneIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { 
  fetchLiveHealthNews, 
  GOVERNMENT_HEALTH_SCHEMES 
} from '@/services/healthNewsService';

const CATEGORIES = [
  { id: 'all', name: 'All News', icon: GlobeAltIcon },
  { id: 'india', name: 'India Health', icon: BuildingOffice2Icon },
  { id: 'global', name: 'Global Research', icon: SparklesIcon },
  { id: 'wellness', name: 'Wellness & Diet', icon: HeartIcon },
  { id: 'schemes', name: 'Government Schemes', icon: ShieldCheckIcon }
];

const HealthNews = () => {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load news when category changes
  useEffect(() => {
    if (activeCategory !== 'schemes') {
      loadNews(activeCategory, false);
    } else {
      setLoading(false);
    }
  }, [activeCategory]);

  const loadNews = async (category, forceRefresh = false) => {
    if (forceRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const data = await fetchLiveHealthNews(category, forceRefresh);
      setArticles(data || []);
      if (forceRefresh) {
        toast.success('Health news updated');
      }
    } catch (err) {
      console.error('Error loading news:', err);
      toast.error('Unable to fetch live news. Showing curated articles.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleCopyLink = (url, title) => {
    if (!url || url === '#') {
      toast.error('No external URL available');
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success(`Copied: "${title.slice(0, 30)}..."`);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Recent';
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
      
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return 'Recent';
    }
  };

  // Filtered lists based on search
  const filteredArticles = articles.filter(article => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (article.title || '').toLowerCase().includes(q) ||
      (article.description || '').toLowerCase().includes(q) ||
      (article.source || '').toLowerCase().includes(q)
    );
  });

  const filteredSchemes = GOVERNMENT_HEALTH_SCHEMES.filter(scheme => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      scheme.title.toLowerCase().includes(q) ||
      scheme.description.toLowerCase().includes(q) ||
      scheme.category.toLowerCase().includes(q)
    );
  });

  const topFeaturedArticle = filteredArticles.length > 0 && !searchQuery.trim() && activeCategory !== 'schemes'
    ? filteredArticles[0]
    : null;

  const remainingArticles = topFeaturedArticle 
    ? filteredArticles.slice(1) 
    : filteredArticles;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Search & Category Filter Navigation */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {CATEGORIES.map(cat => {
              const Icon = cat.icon;
              const isSelected = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => {
                    setActiveCategory(cat.id);
                    setSearchQuery('');
                  }}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                      : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-teal-600'}`} />
                  <span>{cat.name}</span>
                </button>
              );
            })}
          </div>

          {/* Right: Search Box & Refresh Button */}
          <div className="flex items-center gap-2.5 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={activeCategory === 'schemes' ? 'Search schemes or benefits...' : 'Search health headlines...'}
                className="w-full pl-9 pr-9 py-2 bg-white text-xs text-gray-900 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 font-medium placeholder-gray-400 shadow-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={() => {
                if (activeCategory === 'schemes') {
                  toast.success('Schemes directory up to date');
                } else {
                  loadNews(activeCategory, true);
                }
              }}
              disabled={loading || isRefreshing}
              className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-all shadow-sm disabled:opacity-50 flex-shrink-0"
              title="Refresh News Feed"
            >
              <ArrowPathIcon className={`w-4 h-4 text-teal-600 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>

        {/* NEWS VIEW (when not in schemes) */}
        {activeCategory !== 'schemes' && (
          <div className="space-y-6">
            
            {/* Loading Skeleton */}
            {loading ? (
              <div className="space-y-6">
                <div className="h-44 bg-white rounded-3xl border border-gray-200 animate-pulse p-6"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <div key={i} className="h-64 bg-white rounded-2xl border border-gray-200 animate-pulse p-4 space-y-4">
                      <div className="h-16 bg-slate-100 rounded-xl"></div>
                      <div className="h-4 bg-slate-100 rounded w-3/4"></div>
                      <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredArticles.length === 0 ? (
              /* Empty State */
              <div className="bg-white rounded-3xl border border-gray-200 p-12 text-center max-w-md mx-auto space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <NewspaperIcon className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-gray-900">No articles found</h3>
                <p className="text-xs text-gray-500">
                  {searchQuery ? `No health news matched "${searchQuery}".` : 'No articles available in this category right now.'}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    Clear Search
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Featured Headline Hero Card */}
                {topFeaturedArticle && (
                  <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow group p-6 sm:p-8">
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                      
                      {/* Left: Content */}
                      <div className="flex-1 space-y-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-medium">
                          <span className="px-3 py-1 rounded-full bg-teal-600 text-white text-[11px] font-extrabold uppercase tracking-wider shadow-xs">
                            Top Story
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-bold border border-teal-100">
                            {topFeaturedArticle.source}
                          </span>
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                            {formatDate(topFeaturedArticle.publishedAt)}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                            {topFeaturedArticle.readTime}
                          </span>
                        </div>

                        <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 group-hover:text-teal-600 transition-colors leading-snug">
                          {topFeaturedArticle.title}
                        </h2>

                        <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
                          {topFeaturedArticle.description}
                        </p>

                        <div className="pt-2 flex items-center gap-3">
                          <a
                            href={topFeaturedArticle.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition-all shadow-sm hover:shadow"
                          >
                            <span>Read Full Article</span>
                            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                          </a>

                          <button
                            onClick={() => handleCopyLink(topFeaturedArticle.url, topFeaturedArticle.title)}
                            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-all"
                            title="Share Article Link"
                          >
                            <ShareIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Right: HB Logo Badge */}
                      <div className="flex-shrink-0 self-center md:self-start bg-gradient-to-br from-teal-50 via-emerald-50/50 to-white p-5 rounded-2xl border border-teal-100 flex flex-col items-center justify-center min-w-[140px] text-center shadow-xs">
                        <img src="/app-logo.png" alt="HealthBridge" className="h-14 w-auto object-contain mb-2" />
                        <span className="text-[11px] font-extrabold text-teal-900">HealthBridge</span>
                        <span className="text-[10px] text-gray-500 font-medium">Live News</span>
                      </div>

                    </div>
                  </div>
                )}

                {/* News Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {remainingArticles.map((article, idx) => (
                    <motion.div
                      key={article.id || idx}
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
                    >
                      {/* Card Header with HB Logo */}
                      <div className="h-20 bg-gradient-to-r from-teal-50/70 via-emerald-50/40 to-slate-50 border-b border-gray-100 px-5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="h-10 w-10 rounded-xl bg-white border border-teal-100 shadow-xs flex items-center justify-center p-1.5 flex-shrink-0">
                            <img src="/app-logo.png" alt="HealthBridge" className="h-full w-auto object-contain" />
                          </div>
                          <div>
                            <span className="text-[11px] font-extrabold text-teal-900 tracking-wide block">HealthBridge</span>
                            <span className="text-[10px] text-gray-500 font-medium">Verified Update</span>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-white text-gray-700 text-[11px] font-bold border border-gray-200 shadow-xs flex-shrink-0">
                          {article.source}
                        </span>
                      </div>

                      {/* Article Content */}
                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-3 text-[11px] text-gray-500 font-medium">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                              {formatDate(article.publishedAt)}
                            </span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5 text-gray-400" />
                              {article.readTime}
                            </span>
                          </div>

                          <h3 className="text-sm font-bold text-gray-900 group-hover:text-teal-600 transition-colors line-clamp-2 leading-snug">
                            {article.title}
                          </h3>

                          <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed">
                            {article.description}
                          </p>
                        </div>

                        {/* Article Footer */}
                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-800 font-bold text-xs transition-colors"
                          >
                            <span>Read Story</span>
                            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                          </a>

                          <button
                            onClick={() => handleCopyLink(article.url, article.title)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            title="Copy link"
                          >
                            <ShareIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            )}

          </div>
        )}

        {/* GOVERNMENT SCHEMES VIEW */}
        {activeCategory === 'schemes' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-200 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-md bg-teal-600 text-white font-bold text-[11px] uppercase tracking-wide">
                  Official Public Health Programs
                </span>
                <h2 className="text-xl font-extrabold text-teal-950">
                  Government Health Schemes &amp; Welfare Initiatives
                </h2>
                <p className="text-xs text-teal-900 leading-relaxed max-w-2xl">
                  Explore verified healthcare welfare policies, free health insurance coverage up to ₹5 Lakh, generic medicine centers, and maternal health incentives.
                </p>
              </div>
              <div className="flex-shrink-0">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white text-teal-800 font-bold text-xs border border-teal-200 shadow-sm">
                  <ShieldCheckIcon className="w-4 h-4 text-teal-600" />
                  {filteredSchemes.length} Active Schemes
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredSchemes.map((scheme, idx) => (
                <motion.div
                  key={scheme.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-teal-50 text-teal-800 font-bold text-[11px] border border-teal-100">
                        {scheme.category}
                      </span>
                      <a
                        href={`tel:${scheme.helpline}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-500 hover:text-teal-700 bg-gray-50 hover:bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 transition-colors"
                      >
                        <PhoneIcon className="w-3 h-3 text-teal-600" />
                        <span>Helpline: {scheme.helpline}</span>
                      </a>
                    </div>

                    <h3 className="text-base font-extrabold text-gray-900 leading-snug">
                      {scheme.title}
                    </h3>

                    <p className="text-xs text-gray-600 leading-relaxed">
                      {scheme.description}
                    </p>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                        Eligibility
                      </span>
                      <p className="text-xs font-semibold text-gray-800">
                        {scheme.eligibility}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block">
                        Key Coverage &amp; Benefits:
                      </span>
                      <ul className="space-y-1.5">
                        {scheme.benefits.map((b, bIdx) => (
                          <li key={bIdx} className="text-xs text-gray-700 flex items-start gap-2">
                            <CheckIcon className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                    <a
                      href={scheme.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <span>Official Portal</span>
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </a>

                    <a
                      href={`tel:${scheme.helpline}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 hover:text-teal-700 transition-colors"
                    >
                      <PhoneIcon className="w-3.5 h-3.5 text-teal-600" />
                      <span>Call {scheme.helpline}</span>
                    </a>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default HealthNews;
