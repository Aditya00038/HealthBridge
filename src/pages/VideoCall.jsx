import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { appointmentServices } from '@/services/firebaseServices';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  addDoc,
  serverTimestamp,
  arrayUnion,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import toast from 'react-hot-toast';
import {
  VideoCameraIcon,
  VideoCameraSlashIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
  ChatBubbleLeftRightIcon,
  ComputerDesktopIcon,
  ClipboardDocumentListIcon,
  ClockIcon,
  InformationCircleIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  BoltIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  PlusIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { HeartIcon } from '@heroicons/react/24/solid';

const parseAppointmentDateTime = (appointment) => {
  if (!appointment?.appointmentDate || !appointment?.appointmentTime) {
    return null;
  }

  const [time, modifier] = appointment.appointmentTime.split(' ');
  if (!time || !modifier) return null;

  let [hours, minutes] = time.split(':');
  if (typeof minutes === 'undefined') {
    minutes = '00';
  }

  let parsedHours = parseInt(hours, 10);
  const parsedMinutes = parseInt(minutes, 10);

  if (modifier.toUpperCase() === 'PM' && parsedHours !== 12) {
    parsedHours += 12;
  }
  if (modifier.toUpperCase() === 'AM' && parsedHours === 12) {
    parsedHours = 0;
  }

  const isoString = `${appointment.appointmentDate}T${parsedHours.toString().padStart(2, '0')}:${parsedMinutes
    .toString()
    .padStart(2, '0')}:00`;
  return new Date(isoString);
};

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const VideoCall = () => {
  const { user, userProfile } = useAuth();
  const { appointmentId } = useParams();
  const navigate = useNavigate();

  // Media Refs
  const videoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pcRef = useRef(null);
  const signalUnsubRef = useRef(null);
  const chatMessagesRef = useRef(null);

  // Call States
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [remoteUserConnected, setRemoteUserConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  // Chat States
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  // Prescription States (Replaces Consultation Notes)
  const [showPrescription, setShowPrescription] = useState(false);
  const [issuedPrescription, setIssuedPrescription] = useState(null);
  const [isSavingPrescription, setIsSavingPrescription] = useState(false);
  const [prescriptionForm, setPrescriptionForm] = useState({
    diagnosis: '',
    healthCondition: '',
    instructions: '',
    nextVisit: '',
    medicines: [
      { name: '', dosage: '', frequency: 'Twice daily', duration: '5 days', timing: 'After food' }
    ]
  });

  // Appointment & Call Details
  const [appointmentData, setAppointmentData] = useState(null);
  const [loadingAppointment, setLoadingAppointment] = useState(true);
  const [appointmentError, setAppointmentError] = useState(null);

  const isInstantCall = appointmentId?.startsWith('instant-') || appointmentData?.isInstantCall;
  const isDoctor = userProfile?.role === 'doctor' || (appointmentData?.doctorId && user?.uid === appointmentData.doctorId);

  // Remote User Name
  const remoteUserName = isDoctor
    ? (appointmentData?.patientName || 'Patient')
    : (appointmentData?.doctorName || 'Doctor');
  const remoteUserRole = isDoctor ? 'Patient' : 'Doctor';

  // Timer for Call Duration
  useEffect(() => {
    let interval;
    if (isCallActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isCallActive]);

  // Load appointment / Instant Call details
  useEffect(() => {
    const loadAppointment = async () => {
      try {
        setLoadingAppointment(true);

        if (appointmentId?.startsWith('instant-')) {
          let call = null;
          let callDocId = appointmentId;

          try {
            const q = query(collection(db, 'instant_calls'), where('callRoomId', '==', appointmentId));
            const snap = await getDocs(q);
            if (!snap.empty) {
              call = snap.docs[0].data();
              callDocId = snap.docs[0].id;
            }
          } catch (_) {}

          if (!call) {
            try {
              const qChats = query(collection(db, 'chats'), where('callRoomId', '==', appointmentId));
              const snapChats = await getDocs(qChats);
              if (!snapChats.empty) {
                // Find document that is actually the instant call document (not a chat message or signal)
                const instantDoc = snapChats.docs.find(d => {
                  const data = d.data();
                  return data._isInstantCall || (data.patientId && data.type !== 'room_chat' && data.type !== 'webrtc_signal');
                });
                if (instantDoc) {
                  call = instantDoc.data();
                  callDocId = instantDoc.id;
                }
              }
            } catch (_) {}
          }

          if (!call) {
            try {
              const directSnap = await getDoc(doc(db, 'instant_calls', appointmentId));
              if (directSnap.exists()) {
                call = directSnap.data();
                callDocId = directSnap.id;
              }
            } catch (_) {}
          }

          if (!call) {
            try {
              const directChatSnap = await getDoc(doc(db, 'chats', appointmentId));
              if (directChatSnap.exists()) {
                call = directChatSnap.data();
                callDocId = directChatSnap.id;
              }
            } catch (_) {}
          }

          if (call) {
            setAppointmentData({
              id: callDocId,
              doctorId: call.acceptedByDoctorId || call.targetDoctorId,
              doctorName: call.acceptedByDoctorName || call.targetDoctorName || 'Doctor on Duty',
              patientId: call.patientId,
              patientName: call.patientName || 'Patient',
              reasonForVisit: call.problemDescription || 'Instant Emergency Consultation',
              appointmentType: 'video',
              priority: call.priority || 'MEDIUM',
              triageSummary: call.triageSummary,
              firstAidAdvice: call.firstAidAdvice,
              isInstantCall: true,
              appointmentDate: new Date().toISOString().split('T')[0],
              appointmentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          } else {
            setAppointmentData({
              id: appointmentId,
              doctorName: 'Doctor on Duty',
              patientName: 'Patient',
              reasonForVisit: 'Instant Live Consultation',
              appointmentType: 'video',
              priority: 'MEDIUM',
              isInstantCall: true,
              appointmentDate: new Date().toISOString().split('T')[0],
              appointmentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }

          setIsCallActive(true);
          return;
        }

        // Regular scheduled appointment
        const data = await appointmentServices.getAppointmentById(appointmentId);
        if (!data) {
          setAppointmentError('Appointment not found or may have been removed.');
          return;
        }
        setAppointmentData(data);
      } catch (error) {
        console.error('Error loading appointment:', error);
        setAppointmentError('Unable to load appointment details. Please try again later.');
      } finally {
        setLoadingAppointment(false);
      }
    };

    if (appointmentId) {
      loadAppointment();
    } else {
      setAppointmentError('No appointment reference provided.');
      setLoadingAppointment(false);
    }
  }, [appointmentId]);

  // Auto-sync patient ID and name from WebRTC signaling and chat
  useEffect(() => {
    if (!appointmentId || !user || !isDoctor) return;

    // Listen to signaling doc
    const signalDocRef = doc(db, 'chats', `signal_${appointmentId}`);
    const unsubSignal = onSnapshot(signalDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const otherId = data.callerId === user.uid ? data.calleeId : data.callerId;
        const otherName = data.callerId === user.uid ? data.calleeName : data.callerName;
        if (otherId) {
          setAppointmentData(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              patientId: prev.patientId || otherId,
              patientName: prev.patientName === 'Patient' && otherName ? otherName : prev.patientName
            };
          });
        }
      }
    });

    return () => unsubSignal();
  }, [appointmentId, user, isDoctor]);

  // Acquire local media stream (camera + mic)
  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.warn('Could not acquire both video and audio, trying audio-only:', err);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true
        });
        localStreamRef.current = audioStream;
        setIsVideoOff(true);
        return audioStream;
      } catch (audioErr) {
        console.warn('Microphone also unavailable:', audioErr);
        toast.error('Camera/Microphone permission denied or device not found. Live chat is still fully active!');
        return null;
      }
    }
  };

  // Setup WebRTC connection once call is active
  useEffect(() => {
    let isMounted = true;

    const setupWebRTC = async () => {
      if (!isCallActive || !appointmentId || !user) return;

      try {
        const stream = await initializeMedia();

        const pc = new RTCPeerConnection(ICE_SERVERS);
        pcRef.current = pc;

        if (stream) {
          stream.getTracks().forEach(track => {
            pc.addTrack(track, stream);
          });
        }

        pc.ontrack = (event) => {
          if (!isMounted) return;
          if (event.streams && event.streams[0]) {
            remoteStreamRef.current = event.streams[0];
            if (remoteVideoRef.current) {
              remoteVideoRef.current.srcObject = event.streams[0];
            }
            setRemoteUserConnected(true);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setRemoteUserConnected(true);
          }
        };

        const signalDocRef = doc(db, 'chats', `signal_${appointmentId}`);
        const processedCandidates = new Set();

        const signalSnap = await getDoc(signalDocRef);
        const hasExistingCaller = signalSnap.exists() && signalSnap.data()?.callerId && signalSnap.data()?.callerId !== user.uid;
        const isCaller = !hasExistingCaller;

        if (isCaller) {
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              updateDoc(signalDocRef, {
                callerCandidates: arrayUnion(event.candidate.toJSON())
              }).catch(() => {
                setDoc(signalDocRef, {
                  callerCandidates: [event.candidate.toJSON()]
                }, { merge: true });
              });
            }
          };

          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          await pc.setLocalDescription(offer);

          await setDoc(signalDocRef, {
            callRoomId: appointmentId,
            type: 'webrtc_signal',
            callerId: user.uid,
            callerName: userProfile?.name || user?.displayName || 'User',
            offer: { type: offer.type, sdp: offer.sdp },
            callerCandidates: [],
            calleeCandidates: [],
            updatedAt: serverTimestamp()
          }, { merge: true });

          const unsub = onSnapshot(signalDocRef, async (docSnap) => {
            if (!docSnap.exists() || !isMounted) return;
            const data = docSnap.data();

            if (data.answer && !pc.currentRemoteDescription) {
              try {
                await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
              } catch (e) {
                console.warn('[WebRTC] Error setting remote description on caller:', e);
              }
            }

            if (Array.isArray(data.calleeCandidates)) {
              for (const cand of data.calleeCandidates) {
                const key = JSON.stringify(cand);
                if (!processedCandidates.has(key)) {
                  processedCandidates.add(key);
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn('[WebRTC] Error adding ICE candidate on caller:', e);
                  }
                }
              }
            }
          });

          signalUnsubRef.current = unsub;

        } else {
          pc.onicecandidate = (event) => {
            if (event.candidate) {
              updateDoc(signalDocRef, {
                calleeCandidates: arrayUnion(event.candidate.toJSON())
              }).catch(() => {
                setDoc(signalDocRef, {
                  calleeCandidates: [event.candidate.toJSON()]
                }, { merge: true });
              });
            }
          };

          const handleOffer = async (offerData) => {
            if (pc.currentRemoteDescription) return;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(offerData));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              await setDoc(signalDocRef, {
                answer: { type: answer.type, sdp: answer.sdp },
                calleeId: user.uid,
                calleeName: userProfile?.name || user?.displayName || 'User',
                updatedAt: serverTimestamp()
              }, { merge: true });
            } catch (e) {
              console.warn('[WebRTC] Error handling offer on callee:', e);
            }
          };

          if (signalSnap.exists() && signalSnap.data()?.offer) {
            await handleOffer(signalSnap.data().offer);
          }

          const unsub = onSnapshot(signalDocRef, async (docSnap) => {
            if (!docSnap.exists() || !isMounted) return;
            const data = docSnap.data();

            if (data.offer && !pc.currentRemoteDescription) {
              await handleOffer(data.offer);
            }

            if (Array.isArray(data.callerCandidates)) {
              for (const cand of data.callerCandidates) {
                const key = JSON.stringify(cand);
                if (!processedCandidates.has(key)) {
                  processedCandidates.add(key);
                  try {
                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                  } catch (e) {
                    console.warn('[WebRTC] Error adding ICE candidate on callee:', e);
                  }
                }
              }
            }
          });

          signalUnsubRef.current = unsub;
        }

      } catch (err) {
        console.error('[WebRTC] Setup failed:', err);
      }
    };

    setupWebRTC();

    return () => {
      isMounted = false;
      if (signalUnsubRef.current) {
        signalUnsubRef.current();
        signalUnsubRef.current = null;
      }
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
    };
  }, [isCallActive, appointmentId, user]);

  // Real-time Chat Subscription
  useEffect(() => {
    if (!appointmentId) return;

    const q = query(
      collection(db, 'chats'),
      where('callRoomId', '==', appointmentId),
      where('type', '==', 'room_chat')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(docSnap => {
        const d = docSnap.data();
        let ts = new Date();
        if (d.createdAt?.toDate) {
          ts = d.createdAt.toDate();
        } else if (d.createdAt?.seconds) {
          ts = new Date(d.createdAt.seconds * 1000);
        }
        return {
          id: docSnap.id,
          ...d,
          timestamp: ts
        };
      });

      msgs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      setChatMessages(msgs);

      if (!showChat && msgs.length > 0) {
        setUnreadCount(prev => prev + 1);
      }
    }, (err) => {
      console.warn('Chat listener error:', err);
    });

    return () => unsub();
  }, [appointmentId, showChat]);

  // Auto-scroll chat internally to bottom WITHOUT scrolling the browser window
  useEffect(() => {
    if (showChat && chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
      setUnreadCount(0);
    }
  }, [chatMessages, showChat]);

  // Send Chat Message to Firestore
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      await addDoc(collection(db, 'chats'), {
        callRoomId: appointmentId,
        type: 'room_chat',
        senderId: user.uid,
        senderName: userProfile?.name || user?.displayName || (isDoctor ? 'Doctor' : 'Patient'),
        senderRole: isDoctor ? 'Doctor' : 'Patient',
        message: messageText,
        createdAt: serverTimestamp()
      });

      // Internal container scroll only
      setTimeout(() => {
        if (chatMessagesRef.current) {
          chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight;
        }
      }, 50);
    } catch (err) {
      console.error('Error sending message:', err);
      toast.error('Could not send message. Please try again.');
    }
  };

  // Pre-fill health condition from problem description
  useEffect(() => {
    if (appointmentData?.problemDescription && !prescriptionForm.healthCondition) {
      setPrescriptionForm(prev => ({
        ...prev,
        healthCondition: appointmentData.problemDescription,
        diagnosis: appointmentData.recommendedSpecialty ? `Consultation (${appointmentData.recommendedSpecialty})` : ''
      }));
    }
  }, [appointmentData]);

  // Real-time listener for prescription issued in this call room
  useEffect(() => {
    if (!appointmentId) return;

    const q = query(
      collection(db, 'patientRecords'),
      where('callRoomId', '==', appointmentId)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const data = snap.docs[0].data();
        setIssuedPrescription({
          id: snap.docs[0].id,
          ...data,
          date: data.visitDate?.toDate ? data.visitDate.toDate().toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
        });
      }
    }, (err) => {
      console.warn('Prescription subscription notice:', err);
    });

    return () => unsub();
  }, [appointmentId]);

  const handleAddMedicine = () => {
    setPrescriptionForm(prev => ({
      ...prev,
      medicines: [
        ...prev.medicines,
        { name: '', dosage: '', frequency: 'Twice daily', duration: '5 days', timing: 'After food' }
      ]
    }));
  };

  const handleRemoveMedicine = (index) => {
    setPrescriptionForm(prev => ({
      ...prev,
      medicines: prev.medicines.filter((_, i) => i !== index)
    }));
  };

  const handleMedicineChange = (index, field, value) => {
    setPrescriptionForm(prev => ({
      ...prev,
      medicines: prev.medicines.map((m, i) => i === index ? { ...m, [field]: value } : m)
    }));
  };

  const handleSavePrescription = async (e) => {
    e?.preventDefault();

    // Multi-layer resolution for patientId
    let patientId = appointmentData?.patientId;
    let patientName = appointmentData?.patientName || 'Patient';

    if (!patientId) {
      // 1. Check instant_calls
      try {
        const qInstant = query(collection(db, 'instant_calls'), where('callRoomId', '==', appointmentId));
        const snapInstant = await getDocs(qInstant);
        if (!snapInstant.empty && snapInstant.docs[0].data()?.patientId) {
          patientId = snapInstant.docs[0].data().patientId;
          patientName = snapInstant.docs[0].data().patientName || patientName;
        }
      } catch (_) {}
    }

    if (!patientId) {
      // 2. Check chats collection for instant call record
      try {
        const qChats = query(collection(db, 'chats'), where('callRoomId', '==', appointmentId));
        const snapChats = await getDocs(qChats);
        const instantDoc = snapChats.docs.find(d => {
          const dt = d.data();
          return dt.patientId && dt.type !== 'room_chat' && dt.type !== 'webrtc_signal';
        });
        if (instantDoc) {
          patientId = instantDoc.data().patientId;
          patientName = instantDoc.data().patientName || patientName;
        }
      } catch (_) {}
    }

    if (!patientId) {
      // 3. Check WebRTC signaling doc
      try {
        const sigSnap = await getDoc(doc(db, 'chats', `signal_${appointmentId}`));
        if (sigSnap.exists()) {
          const sData = sigSnap.data();
          const remoteId = sData.callerId === user.uid ? sData.calleeId : sData.callerId;
          const remoteName = sData.callerId === user.uid ? sData.calleeName : sData.callerName;
          if (remoteId) {
            patientId = remoteId;
            if (remoteName) patientName = remoteName;
          }
        }
      } catch (_) {}
    }

    if (!patientId) {
      // 4. Check room chat messages from Patient
      const patientMsg = chatMessages.find(m => m.senderId && m.senderId !== user.uid);
      if (patientMsg) {
        patientId = patientMsg.senderId;
        patientName = patientMsg.senderName || patientName;
      }
    }

    if (!patientId) {
      toast.error('Patient has not yet connected to this consultation room. Please wait for patient to join.');
      return;
    }

    // Update appointmentData with resolved patient info
    setAppointmentData(prev => prev ? ({ ...prev, patientId, patientName }) : prev);

    const validMedicines = prescriptionForm.medicines.filter(m => m.name.trim() !== '');
    if (!prescriptionForm.diagnosis.trim()) {
      toast.error('Please enter a clinical diagnosis.');
      return;
    }

    try {
      setIsSavingPrescription(true);

      const payload = {
        patientId: patientId,
        patientName: patientName,
        doctorId: user.uid,
        doctorName: userProfile?.name || user?.displayName || 'Doctor',
        specialty: userProfile?.specialty || appointmentData?.recommendedSpecialty || 'General Physician',
        hospital: userProfile?.hospital || 'HealthBridge Telehealth',
        visitDate: Timestamp.now(),
        diagnosis: prescriptionForm.diagnosis.trim(),
        healthCondition: prescriptionForm.healthCondition.trim() || appointmentData?.problemDescription || '',
        medicines: validMedicines,
        instructions: prescriptionForm.instructions.trim(),
        nextVisit: prescriptionForm.nextVisit || null,
        callRoomId: appointmentId,
        appointmentId: appointmentId,
        status: 'prescribed',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await addDoc(collection(db, 'patientRecords'), payload);

      // Automated room chat notification
      try {
        await addDoc(collection(db, 'chats'), {
          callRoomId: appointmentId,
          type: 'room_chat',
          senderId: user.uid,
          senderName: userProfile?.name || user?.displayName || 'Doctor',
          senderRole: 'Doctor',
          message: 'Official prescription has been issued and stored in your Prescriptions dashboard. Click the Prescription button to view.',
          createdAt: serverTimestamp()
        });
      } catch (_) {}

      toast.success('Prescription issued successfully! Stored in patient dashboard.');
    } catch (err) {
      console.error('Error saving prescription:', err);
      toast.error('Failed to save prescription: ' + (err.message || 'Permission denied'));
    } finally {
      setIsSavingPrescription(false);
    }
  };

  // Toggle Mute Audio
  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !nextMuted;
      });
    }
  };

  // Toggle Camera Video
  const toggleVideo = () => {
    const nextVideoOff = !isVideoOff;
    setIsVideoOff(nextVideoOff);
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !nextVideoOff;
      });
    }
  };

  // Toggle Screen Sharing
  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        if (pcRef.current) {
          const senders = pcRef.current.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          }
        }

        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
        }

        screenTrack.onended = () => {
          stopScreenShare();
        };

        setIsScreenSharing(true);
        toast.success('Screen sharing started');
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    setIsScreenSharing(false);
    if (localStreamRef.current) {
      const cameraTrack = localStreamRef.current.getVideoTracks()[0];
      if (pcRef.current && cameraTrack) {
        const senders = pcRef.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(cameraTrack);
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = localStreamRef.current;
      }
    }
  };

  // End Call
  const handleEndCall = async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (signalUnsubRef.current) {
      signalUnsubRef.current();
      signalUnsubRef.current = null;
    }

    try {
      const signalDocRef = doc(db, 'chats', `signal_${appointmentId}`);
      await setDoc(signalDocRef, { callEnded: true }, { merge: true });
    } catch (_) {}

    setIsCallActive(false);
    setRemoteUserConnected(false);
    toast.success('Call ended successfully');

    navigate(isDoctor ? '/doctor/dashboard' : '/patient/dashboard');
  };

  const startScheduledCall = () => {
    setIsConnecting(true);
    setTimeout(() => {
      setIsCallActive(true);
      setIsConnecting(false);
    }, 1200);
  };

  const formatDuration = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Loading Screen (White Theme)
  if (loadingAppointment) {
    return (
      <div className="fixed inset-0 h-screen w-screen bg-slate-50 flex items-center justify-center">
        <LoadingSpinner text="Connecting to call room..." />
      </div>
    );
  }

  // Error Screen (White Theme)
  if (appointmentError) {
    return (
      <div className="fixed inset-0 h-screen w-screen bg-slate-50 flex items-center justify-center px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white border border-slate-200 shadow-xl rounded-3xl p-8 max-w-md text-slate-900">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
            <InformationCircleIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold mb-2">Unable to join call</h2>
          <p className="text-slate-600 text-sm mb-6">{appointmentError}</p>
          <button
            onClick={() => navigate(isDoctor ? '/doctor/dashboard' : '/patient/dashboard')}
            className="w-full px-5 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 shadow-md transition"
          >
            Back to Dashboard
          </button>
        </motion.div>
      </div>
    );
  }

  // Scheduled appointment pre-call screen (White Theme)
  if (!isCallActive && !isInstantCall) {
    return (
      <div className="fixed inset-0 h-screen w-screen bg-slate-50 flex items-center justify-center px-4 py-8">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="bg-white border border-slate-200 rounded-3xl p-8 max-w-lg w-full text-slate-900 shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
              <VideoCameraIcon className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">Video Consultation</h2>
              <p className="text-xs text-slate-500">Scheduled Appointment Room</p>
            </div>
          </div>

          <div className="space-y-3 mb-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Consulting with:</span>
              <span className="font-semibold text-slate-900">{remoteUserName} ({remoteUserRole})</span>
            </div>
            {appointmentData?.reasonForVisit && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Reason:</span>
                <span className="font-medium text-slate-800">{appointmentData.reasonForVisit}</span>
              </div>
            )}
          </div>

          <button
            onClick={startScheduledCall}
            disabled={isConnecting}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            {isConnecting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Joining Room...</span>
              </>
            ) : (
              <>
                <VideoCameraIcon className="w-5 h-5" />
                <span>Join Video Call Now</span>
              </>
            )}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 h-screen w-screen bg-slate-100 flex flex-col overflow-hidden select-none">
      
      {/* Top Header Bar (Clean White Theme) */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 z-20 shadow-xs flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 sm:gap-4">
            
            {/* Live Indicator */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200">
              <span className={`w-2.5 h-2.5 rounded-full ${remoteUserConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-ping'}`} />
              <span className="text-emerald-800 font-bold text-xs sm:text-sm">
                {remoteUserConnected ? 'Live Consultation' : 'Connecting...'}
              </span>
            </div>

            {/* Duration pill with ClockIcon (NO EMOJIS) */}
            <div className="flex items-center gap-1.5 text-slate-700 text-xs sm:text-sm font-semibold bg-slate-100 px-3 py-1.5 rounded-full border border-slate-200 font-mono">
              <ClockIcon className="w-4 h-4 text-slate-500" />
              <span>{formatDuration(callDuration)}</span>
            </div>

            {/* Priority pill with BoltIcon (NO EMOJIS) */}
            {isInstantCall && appointmentData?.priority && (
              <div className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                appointmentData.priority === 'CRITICAL'
                  ? 'bg-rose-50 text-rose-700 border-rose-200'
                  : appointmentData.priority === 'HIGH'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                <BoltIcon className="w-3.5 h-3.5" />
                <span>{appointmentData.priority} Priority</span>
              </div>
            )}
          </div>

          {/* Remote User Info */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-slate-900 text-xs sm:text-sm font-bold">
                {remoteUserName}
              </div>
              <div className="text-slate-500 text-[11px] font-medium">
                {remoteUserRole}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
              {remoteUserName.slice(0, 2).toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Video & Chat Area */}
      <div className="flex-1 flex relative overflow-hidden min-h-0">
        
        {/* Video Stage Frame */}
        <div className="flex-1 relative bg-slate-900 rounded-3xl m-2 sm:m-3 border border-slate-200 shadow-inner flex items-center justify-center overflow-hidden">
          
          {/* Remote Video Stream */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className={`w-full h-full object-cover transition-opacity duration-300 ${remoteUserConnected ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Waiting Placeholder (Clean White Card Theme) */}
          {!remoteUserConnected && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 bg-slate-900/90 backdrop-blur-xs">
              <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl flex flex-col items-center text-slate-900">
                <div className="relative mb-5">
                  <div className="w-20 h-20 rounded-2xl bg-blue-50 border-2 border-blue-200 flex items-center justify-center text-2xl font-black text-blue-700 shadow-inner">
                    {remoteUserName.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-amber-500 border-2 border-white animate-ping"></span>
                </div>

                <h3 className="text-lg sm:text-xl font-bold text-slate-900 mb-1">
                  Waiting for {remoteUserName} to connect...
                </h3>
                <p className="text-xs text-slate-500 mb-5 leading-relaxed">
                  Video and audio will stream automatically as soon as the other participant enters this room.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                    <VideoCameraIcon className="w-3.5 h-3.5 text-emerald-600" />
                    Camera &amp; Audio Live
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                    <ChatBubbleLeftRightIcon className="w-3.5 h-3.5 text-blue-600" />
                    Live Chat Ready
                  </span>
                </div>

                {appointmentData?.problemDescription && (
                  <div className="w-full bg-slate-50 p-3 rounded-xl border border-slate-200 text-left">
                    <div className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                      <InformationCircleIcon className="w-3.5 h-3.5 text-slate-400" />
                      Health Issue Description:
                    </div>
                    <p className="text-xs font-semibold text-slate-800 leading-snug">
                      "{appointmentData.problemDescription}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Local Camera (Picture-in-Picture) */}
          <div className="absolute top-4 right-4 w-36 h-28 sm:w-48 sm:h-36 bg-slate-900 rounded-2xl overflow-hidden border-2 border-white shadow-xl z-10">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
            />
            {isVideoOff && (
              <div className="w-full h-full bg-slate-800 flex flex-col items-center justify-center text-slate-400">
                <VideoCameraSlashIcon className="w-8 h-8 mb-1" />
                <span className="text-[10px] font-bold">Camera Off</span>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-md text-slate-800 px-2 py-0.5 rounded-lg text-[11px] font-bold border border-slate-200 shadow-sm">
              You {isMuted && <span className="text-rose-600 font-bold">• Muted</span>}
            </div>
          </div>

          {/* Floating Bottom Control Bar (White Theme) */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20 w-auto max-w-full px-4">
            <div className="flex items-center gap-2 sm:gap-3.5 bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-full px-4 sm:px-6 py-2.5 shadow-2xl">
              
              {/* Mic Toggle */}
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full transition-all ${
                  isMuted ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? (
                  <div className="relative">
                    <MicrophoneIcon className="w-5 h-5" />
                    <XMarkIcon className="w-3 h-3 absolute -top-1 -right-1 text-rose-600 font-bold" />
                  </div>
                ) : (
                  <MicrophoneIcon className="w-5 h-5" />
                )}
              </button>

              {/* Video Camera Toggle */}
              <button
                onClick={toggleVideo}
                className={`p-3 rounded-full transition-all ${
                  isVideoOff ? 'bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
              >
                {isVideoOff ? (
                  <VideoCameraSlashIcon className="w-5 h-5" />
                ) : (
                  <VideoCameraIcon className="w-5 h-5" />
                )}
              </button>

              {/* Screen Share Toggle */}
              <button
                onClick={toggleScreenShare}
                className={`p-3 rounded-full transition-all ${
                  isScreenSharing ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
              >
                <ComputerDesktopIcon className="w-5 h-5" />
              </button>

              {/* Real-time Chat Toggle */}
              <button
                onClick={() => {
                  setShowChat(!showChat);
                  setUnreadCount(0);
                }}
                className={`p-3 rounded-full transition-all relative ${
                  showChat ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title="Toggle Live Chat"
              >
                <ChatBubbleLeftRightIcon className="w-5 h-5" />
                {!showChat && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-600 text-white text-[10px] font-black rounded-full flex items-center justify-center animate-bounce">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Prescription Feature (replaces Consultation Details & Notes) */}
              <button
                onClick={() => {
                  setShowPrescription(!showPrescription);
                  if (showChat) setShowChat(false);
                }}
                className={`p-3 rounded-full transition-all relative ${
                  showPrescription ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                }`}
                title={isDoctor ? "Add Prescription" : "View Prescription"}
              >
                <DocumentTextIcon className="w-5 h-5" />
                {issuedPrescription && !isDoctor && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 border-2 border-white rounded-full"></span>
                )}
              </button>

              {/* End Call Button */}
              <button
                onClick={handleEndCall}
                className="p-3 sm:p-3.5 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-600/30 transition-all hover:scale-105"
                title="End Call"
              >
                <PhoneXMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Live Chat Drawer (Clean White Theme) */}
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ x: 380, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 380, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full sm:w-96 bg-white border-l border-slate-200 flex flex-col z-30 shadow-2xl h-full flex-shrink-0"
            >
              {/* Chat Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <ChatBubbleLeftRightIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">Consultation Chat</h3>
                    <p className="text-[11px] text-slate-500">Real-time room messages</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Messages List (Container-scoped scroll without moving screen) */}
              <div ref={chatMessagesRef} className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-50">
                {chatMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 p-4">
                    <ChatBubbleLeftRightIcon className="w-10 h-10 mb-2 opacity-30 text-slate-500" />
                    <p className="text-xs font-semibold text-slate-600">No messages yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Send a message below to chat with {remoteUserName}.</p>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isMe = msg.senderId === user?.uid;
                    return (
                      <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[11px] font-bold text-slate-600">
                            {isMe ? 'You' : msg.senderName}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                            msg.senderRole === 'Doctor'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                            {msg.senderRole}
                          </span>
                        </div>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-xs ${
                          isMe
                            ? 'bg-blue-600 text-white rounded-br-none shadow-blue-500/10'
                            : 'bg-white text-slate-900 rounded-bl-none border border-slate-200 shadow-slate-100'
                        }`}>
                          {msg.message}
                        </div>
                        <span className="text-[10px] text-slate-400 mt-1 px-1 font-mono">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendMessage} className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder={`Message ${remoteUserName}...`}
                    className="flex-1 bg-slate-50 text-slate-900 text-sm px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 placeholder-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-xl transition-all flex items-center justify-center shadow-md shadow-blue-500/20"
                  >
                    <PaperAirplaneIcon className="w-4 h-4 text-white -rotate-45" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Prescription Drawer (Clean White Theme) */}
        <AnimatePresence>
          {showPrescription && (
            <motion.div
              initial={{ x: 420, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 420, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full sm:w-[440px] bg-white border-l border-slate-200 flex flex-col z-30 shadow-2xl h-full flex-shrink-0"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                    <DocumentTextIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-sm">
                      {isDoctor ? "Add Medical Prescription" : "Doctor's Prescription"}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Stores automatically in Patient Prescriptions page
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrescription(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-50">
                {isDoctor ? (
                  // --- DOCTOR: CREATE / ISSUE PRESCRIPTION FORM ---
                  <form onSubmit={handleSavePrescription} className="space-y-4">
                    {/* Patient & Date Header info */}
                    <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Patient</div>
                        <div className="text-sm font-bold text-slate-900">{appointmentData?.patientName || 'Patient'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date</div>
                        <div className="text-xs font-semibold text-slate-700">{new Date().toLocaleDateString('en-IN')}</div>
                      </div>
                    </div>

                    {/* Diagnosis & Condition */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Diagnosis <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={prescriptionForm.diagnosis}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, diagnosis: e.target.value })}
                          placeholder="e.g. Acute Bronchitis, Migraine, Viral Infection"
                          className="w-full bg-slate-50 text-slate-900 text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Health Condition / Clinical Notes
                        </label>
                        <input
                          type="text"
                          value={prescriptionForm.healthCondition}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, healthCondition: e.target.value })}
                          placeholder="Patient symptoms & observation"
                          className="w-full bg-slate-50 text-slate-900 text-xs px-3.5 py-2.5 rounded-xl border border-slate-300 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Medicines Section */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">
                          Medicines (Rx)
                        </span>
                        <button
                          type="button"
                          onClick={handleAddMedicine}
                          className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 px-2.5 py-1 rounded-lg hover:bg-blue-50 border border-blue-200"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                          <span>Add Medicine</span>
                        </button>
                      </div>

                      {prescriptionForm.medicines.map((med, index) => (
                        <div key={index} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={med.name}
                              onChange={(e) => handleMedicineChange(index, 'name', e.target.value)}
                              placeholder="Medicine Name (e.g. Paracetamol 650mg)"
                              className="flex-1 bg-white text-slate-900 text-xs px-3 py-1.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:outline-none font-semibold"
                            />
                            {prescriptionForm.medicines.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMedicine(index)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                                title="Remove Medicine"
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <input
                              type="text"
                              value={med.dosage}
                              onChange={(e) => handleMedicineChange(index, 'dosage', e.target.value)}
                              placeholder="Dosage (e.g. 1 Tablet / 5ml)"
                              className="bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300"
                            />
                            <select
                              value={med.frequency}
                              onChange={(e) => handleMedicineChange(index, 'frequency', e.target.value)}
                              className="bg-white text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300"
                            >
                              <option value="Once daily">Once daily</option>
                              <option value="Twice daily">Twice daily</option>
                              <option value="Thrice daily">Thrice daily</option>
                              <option value="Every 4 hours">Every 4 hours</option>
                              <option value="SOS (As needed)">SOS (As needed)</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <input
                              type="text"
                              value={med.duration}
                              onChange={(e) => handleMedicineChange(index, 'duration', e.target.value)}
                              placeholder="Duration (e.g. 3 days, 1 week)"
                              className="bg-white text-slate-900 text-xs px-2.5 py-1.5 rounded-lg border border-slate-300"
                            />
                            <select
                              value={med.timing}
                              onChange={(e) => handleMedicineChange(index, 'timing', e.target.value)}
                              className="bg-white text-slate-900 text-xs px-2 py-1.5 rounded-lg border border-slate-300"
                            >
                              <option value="After food">After food</option>
                              <option value="Before food">Before food</option>
                              <option value="With food">With food</option>
                              <option value="At bedtime">At bedtime</option>
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Special Instructions & Follow-up */}
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Doctor's Instructions &amp; Advice
                        </label>
                        <textarea
                          rows={3}
                          value={prescriptionForm.instructions}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, instructions: e.target.value })}
                          placeholder="e.g. Drink plenty of warm water, rest for 3 days, avoid cold drinks."
                          className="w-full bg-slate-50 text-slate-900 text-xs p-3 rounded-xl border border-slate-300 focus:bg-white focus:border-blue-500 focus:outline-none resize-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Follow-up / Next Visit Date (Optional)
                        </label>
                        <input
                          type="date"
                          value={prescriptionForm.nextVisit}
                          onChange={(e) => setPrescriptionForm({ ...prescriptionForm, nextVisit: e.target.value })}
                          className="w-full bg-slate-50 text-slate-900 text-xs px-3.5 py-2 rounded-xl border border-slate-300 focus:bg-white focus:border-blue-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isSavingPrescription}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSavingPrescription ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Sending Prescription...</span>
                        </>
                      ) : (
                        <>
                          <PaperAirplaneIcon className="w-4 h-4 -rotate-45" />
                          <span>Send Prescription to Patient</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : (
                  // --- PATIENT: VIEW ISSUED PRESCRIPTION ---
                  <div className="space-y-4">
                    {issuedPrescription ? (
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                          <div>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase">
                              Official Prescription
                            </span>
                            <h4 className="text-base font-extrabold text-slate-900 mt-1">
                              Dr. {issuedPrescription.doctorName}
                            </h4>
                            <p className="text-xs text-slate-500">{issuedPrescription.specialty} • {issuedPrescription.hospital}</p>
                          </div>
                          <CheckCircleIcon className="w-7 h-7 text-emerald-600" />
                        </div>

                        <div>
                          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Diagnosis</div>
                          <p className="text-sm font-semibold text-slate-900">{issuedPrescription.diagnosis}</p>
                        </div>

                        {issuedPrescription.healthCondition && (
                          <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Condition</div>
                            <p className="text-xs text-slate-700">{issuedPrescription.healthCondition}</p>
                          </div>
                        )}

                        {issuedPrescription.medicines && issuedPrescription.medicines.length > 0 && (
                          <div>
                            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Prescribed Medicines</div>
                            <div className="space-y-2">
                              {issuedPrescription.medicines.map((m, idx) => (
                                <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                  <div className="font-bold text-xs text-slate-900">{m.name}</div>
                                  <div className="text-[11px] text-slate-600 mt-0.5 flex flex-wrap gap-x-2">
                                    <span>{m.dosage}</span>
                                    <span>•</span>
                                    <span>{m.frequency}</span>
                                    <span>•</span>
                                    <span>{m.duration}</span>
                                    <span>•</span>
                                    <span className="font-semibold text-blue-600">{m.timing}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {issuedPrescription.instructions && (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                            <span className="font-bold block mb-0.5">Instructions:</span>
                            {issuedPrescription.instructions}
                          </div>
                        )}

                        {issuedPrescription.nextVisit && (
                          <div className="text-xs text-slate-600">
                            <strong>Follow-up Visit:</strong> {new Date(issuedPrescription.nextVisit).toLocaleDateString('en-IN')}
                          </div>
                        )}

                        <div className="pt-2">
                          <button
                            onClick={() => window.open('/patient/prescriptions', '_blank')}
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition text-center block"
                          >
                            Open in Patient Dashboard Prescriptions
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-white rounded-2xl border border-slate-200">
                        <DocumentTextIcon className="w-12 h-12 text-slate-300 mb-3" />
                        <h4 className="font-bold text-slate-800 text-sm">No prescription issued yet</h4>
                        <p className="text-xs text-slate-500 mt-1 max-w-xs">
                          When your doctor writes a prescription during this consultation, it will appear here immediately and be saved to your dashboard.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default VideoCall;
