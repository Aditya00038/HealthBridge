import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BoltIcon, 
  PhoneArrowUpRightIcon, 
  SparklesIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  XMarkIcon, 
  ClockIcon, 
  UserIcon, 
  HeartIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  ChatBubbleBottomCenterTextIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { 
  subscribeToWaitingInstantCalls, 
  acceptInstantCall, 
  rejectInstantCall 
} from '@/services/instantCallService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const DoctorInstantCalls = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'normal', 'urgent'
  const [actionInProgress, setActionInProgress] = useState(null);

  // Reject modal state
  const [rejectingCall, setRejectingCall] = useState(null);
  const [rejectReason, setRejectReason] = useState('Currently attending another patient');

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const unsub = subscribeToWaitingInstantCalls(user.uid, (waitingCalls) => {
      setCalls(waitingCalls || []);
      setLoading(false);
    });

    return () => {
      if (unsub) unsub();
    };
  }, [user]);

  const handleAccept = async (call) => {
    try {
      setActionInProgress(call.id);
      toast.loading('Claiming call (First-Come, First-Served)...', { id: 'accept-fcfs' });

      const doctorData = {
        id: user.uid,
        name: userProfile?.name || user?.displayName || 'Doctor'
      };

      const result = await acceptInstantCall(call.id, doctorData, call.collectionName);

      if (result.success) {
        toast.success('Call claimed successfully! Connecting to video room...', { id: 'accept-fcfs' });
        setTimeout(() => {
          navigate(`/video-call/${result.callRoomId}`);
        }, 800);
      } else if (result.reason === 'ALREADY_ACCEPTED') {
        toast.error(`Call was already accepted by Dr. ${result.acceptedBy || 'another doctor'} (FCFS).`, { id: 'accept-fcfs' });
      } else {
        toast.error('Could not claim call. Please try again.', { id: 'accept-fcfs' });
      }
    } catch (err) {
      console.error('Error claiming call:', err);
      toast.error('Failed to claim call.', { id: 'accept-fcfs' });
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRejectConfirm = async () => {
    if (!rejectingCall) return;
    try {
      setActionInProgress(rejectingCall.id);
      const doctorData = {
        id: user.uid,
        name: userProfile?.name || user?.displayName || 'Doctor'
      };

      const res = await rejectInstantCall(rejectingCall.id, doctorData, rejectReason, rejectingCall.collectionName);
      if (res.success) {
        toast.success('Request declined. Patient re-routed to other available doctors.');
        setRejectingCall(null);
      } else {
        toast.error('Failed to decline request.');
      }
    } catch (err) {
      console.error('Error declining call:', err);
      toast.error('Error declining request.');
    } finally {
      setActionInProgress(null);
    }
  };

  // Filter calls
  const filteredCalls = calls.filter(call => {
    const isNormal = call.priority === 'LOW' || call.priority === 'MEDIUM' || (call.urgencyScore && call.urgencyScore <= 2);
    if (filter === 'normal') return isNormal;
    if (filter === 'urgent') return !isNormal;
    return true;
  });

  const normalCount = calls.filter(c => c.priority === 'LOW' || c.priority === 'MEDIUM' || (c.urgencyScore && c.urgencyScore <= 2)).length;
  const urgentCount = calls.filter(c => c.priority === 'CRITICAL' || c.priority === 'HIGH').length;

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-700 font-bold text-xs flex items-center gap-1.5 uppercase tracking-wide">
                <BoltIcon className="w-4 h-4 text-rose-600" />
                Live Instant Calls
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs uppercase tracking-wide">
                ⚡ First-Come, First-Served
              </span>
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs uppercase tracking-wide">
                Groq AI Triaged
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              Patient Instant Call Queue
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Review live consultation requests from patients. Normal health issues are open to all doctors for prompt care.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <Link
              to="/doctor/dashboard"
              className="px-4 py-2 bg-white border border-gray-200 text-gray-700 font-semibold text-xs rounded-xl hover:bg-gray-50 shadow-sm transition-all"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Stats Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Waiting</p>
              <p className="text-2xl font-black text-gray-900 mt-1">{calls.length}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 font-bold">
              <BoltIcon className="w-6 h-6 text-amber-500" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Normal Health Issues</p>
              <p className="text-2xl font-black text-teal-600 mt-1">{normalCount}</p>
              <p className="text-[11px] text-gray-400">Open to all doctors</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 font-bold">
              <ShieldCheckIcon className="w-6 h-6" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Urgent / Critical</p>
              <p className="text-2xl font-black text-rose-600 mt-1">{urgentCount}</p>
              <p className="text-[11px] text-gray-400">Needs immediate attention</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600 font-bold">
              <ExclamationTriangleIcon className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Filter Navigation */}
        <div className="flex items-center gap-2 mb-6 bg-white p-1.5 rounded-2xl border border-gray-200 shadow-sm w-fit">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filter === 'all'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>All Requests</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${filter === 'all' ? 'bg-white/20' : 'bg-gray-200'}`}>
              {calls.length}
            </span>
          </button>

          <button
            onClick={() => setFilter('normal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filter === 'normal'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>🩺 Normal Health Issues (All Doctors)</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${filter === 'normal' ? 'bg-white/20' : 'bg-gray-200'}`}>
              {normalCount}
            </span>
          </button>

          <button
            onClick={() => setFilter('urgent')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              filter === 'urgent'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <span>🚨 Urgent / Critical</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${filter === 'urgent' ? 'bg-white/20' : 'bg-gray-200'}`}>
              {urgentCount}
            </span>
          </button>
        </div>

        {/* Calls List */}
        {loading ? (
          <div className="py-20 text-center">
            <LoadingSpinner />
            <p className="text-xs text-gray-500 mt-2">Connecting to live call stream...</p>
          </div>
        ) : filteredCalls.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 shadow-sm">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4">
              <CheckCircleIcon className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              No Pending Calls in This Queue
            </h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto">
              You are currently online. Incoming patient consultation requests will appear here in real time on a First-Come, First-Served basis.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCalls.map((call) => {
              const isCritical = call.priority === 'CRITICAL';
              const isHigh = call.priority === 'HIGH';
              const isNormal = call.priority === 'LOW' || call.priority === 'MEDIUM';
              const isActing = actionInProgress === call.id;

              return (
                <motion.div
                  key={call.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`bg-white rounded-3xl p-6 border-2 shadow-sm transition-all ${
                    isCritical 
                      ? 'border-red-400 shadow-red-100' 
                      : isHigh 
                      ? 'border-orange-300' 
                      : 'border-teal-200'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    
                    {/* Patient & Health Issue Details */}
                    <div className="flex-1 space-y-3">
                      {/* Priority and Tags Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-3 py-1 rounded-lg text-xs font-black tracking-wider uppercase ${
                          isCritical
                            ? 'bg-red-600 text-white animate-pulse'
                            : isHigh
                            ? 'bg-orange-500 text-white'
                            : 'bg-teal-600 text-white'
                        }`}>
                          {call.priority} PRIORITY
                        </span>

                        {isNormal && (
                          <span className="px-2.5 py-0.5 rounded-md bg-teal-50 text-teal-700 text-xs font-bold border border-teal-200">
                            Normal Health Issue • Visible to All Doctors
                          </span>
                        )}

                        <span className="text-xs text-gray-500 font-medium">
                          Recommended Specialty: <strong className="text-gray-800">{call.recommendedSpecialty}</strong>
                        </span>

                        {call.targetDoctorName && (
                          <span className="text-xs text-gray-400">
                            (Target: {call.targetDoctorName})
                          </span>
                        )}
                      </div>

                      {/* Patient Name and Time */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-700 font-bold text-sm">
                          {call.patientName?.[0] || 'P'}
                        </div>
                        <div>
                          <h2 className="text-lg font-extrabold text-gray-900">
                            {call.patientName}
                          </h2>
                          {call.patientPhone && (
                            <p className="text-xs text-gray-500 font-mono">
                              Phone: {call.patientPhone}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Detailed Health Issue Description */}
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                          <ChatBubbleBottomCenterTextIcon className="w-4 h-4 text-teal-600" />
                          Patient Problem Description
                        </h4>
                        <p className="text-sm font-semibold text-gray-900 leading-relaxed">
                          "{call.problemDescription}"
                        </p>
                      </div>

                      {/* Tagged Symptoms */}
                      {Array.isArray(call.symptoms) && call.symptoms.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-gray-400">Symptoms:</span>
                          {call.symptoms.map((s, idx) => (
                            <span key={idx} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Groq AI Clinical Triage Note */}
                      {call.triageSummary && (
                        <div className="p-3 bg-indigo-50/80 rounded-xl border border-indigo-100 text-xs text-indigo-950 font-medium">
                          <span className="font-bold text-indigo-900">⚡ Groq AI Clinical Note:</span> {call.triageSummary}
                        </div>
                      )}

                      {/* First Aid Guidance Advised */}
                      {call.firstAidAdvice && (
                        <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                          <strong>Patient Advised:</strong> {call.firstAidAdvice}
                        </p>
                      )}
                    </div>

                    {/* Action Buttons Column */}
                    <div className="flex lg:flex-col items-center justify-between lg:justify-center gap-3 pt-4 lg:pt-0 border-t lg:border-t-0 border-gray-100 flex-shrink-0">
                      <button
                        onClick={() => handleAccept(call)}
                        disabled={isActing}
                        className="px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isActing ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Connecting...</span>
                          </>
                        ) : (
                          <>
                            <BoltIcon className="w-5 h-5 text-yellow-300" />
                            <span>Accept &amp; Join (FCFS)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setRejectingCall(call);
                        }}
                        disabled={isActing}
                        className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                      >
                        <XMarkIcon className="w-4 h-4" />
                        <span>Decline Request</span>
                      </button>

                      <span className="text-[11px] text-gray-400 font-medium text-center">
                        First-Come, First-Served
                      </span>
                    </div>

                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

      </div>

      {/* Reject Modal */}
      <AnimatePresence>
        {rejectingCall && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-gray-200"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Decline Instant Call Request
              </h3>
              <p className="text-xs text-gray-600 mb-4">
                Declining will remove this request from your view and immediately re-route the patient to other available doctors.
              </p>

              <div className="space-y-2 mb-4">
                <label className="text-xs font-bold text-gray-700">Select Reason:</label>
                {[
                  'Currently attending another patient',
                  'Condition outside my specialty',
                  'Emergency - patient requires in-person hospital care',
                  'Off-duty / schedule unavailable'
                ].map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => setRejectReason(reason)}
                    className={`w-full text-left p-3 rounded-xl text-xs font-semibold border transition-all ${
                      rejectReason === reason
                        ? 'bg-rose-50 border-rose-400 text-rose-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {reason}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setRejectingCall(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRejectConfirm}
                  disabled={actionInProgress === rejectingCall.id}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-all disabled:opacity-50"
                >
                  Confirm Decline
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};

export default DoctorInstantCalls;
