import { 
  collection, 
  addDoc, 
  doc, 
  getDoc, 
  updateDoc, 
  onSnapshot, 
  query, 
  where, 
  serverTimestamp, 
  runTransaction,
  Timestamp,
  arrayUnion
} from 'firebase/firestore';
import { db } from '@/firebase/config';
import { getGroqApiKey, GROQ_MODELS } from './groqChatService';
import { notificationServices } from './notificationServices';

/**
 * AI Triage & Priority Analysis using Groq API
 * Analyzes patient problem description and returns priority, specialty, and triage summary
 */
export async function analyzeProblemWithGroq(problemDescription, symptoms = []) {
  const apiKey = getGroqApiKey();
  const symptomsList = Array.isArray(symptoms) && symptoms.length > 0 ? symptoms.join(', ') : 'None specified';

  const systemPrompt = `You are HealthBridge Emergency Triage AI.
Your role is to analyze a patient's medical problem and assign an accurate medical triage priority.
You must respond with ONLY a valid, raw JSON object (no markdown formatting, no code blocks, no other text) with the following exact keys:
{
  "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
  "priorityLabel": "Critical Emergency" | "High Priority" | "Moderate Priority" | "Routine Consultation",
  "recommendedSpecialty": "General Physician" | "Cardiologist" | "Dermatologist" | "Pediatrician" | "Orthopedic" | "Neurologist" | "ENT Specialist" | "Gynecologist" | "Pulmonologist",
  "triageSummary": "Short 1-2 sentence medical summary for the doctor before joining the call",
  "firstAidAdvice": "1 practical first-aid or safety instruction for the patient while waiting",
  "urgencyScore": 4 for CRITICAL, 3 for HIGH, 2 for MEDIUM, 1 for LOW
}

Triage Priority Definitions:
- CRITICAL (4): Chest pain, heart palpitations, acute shortness of breath, signs of stroke (facial droop, arm weakness), heavy bleeding, severe head injury, loss of consciousness, choking.
- HIGH (3): High fever (>102°F/39°C), severe migraine with nausea, deep wound, acute asthma flare, suspected fracture, intense abdominal pain.
- MEDIUM (2): Persistent fever, moderate pain, skin rashes, earache, diarrhea, vomiting, moderate cuts, cough/cold lasting days.
- LOW (1): Mild cold, minor scratch, routine prescription question, general health inquiry, minor allergy.`;

  const userPrompt = `Patient Problem: "${problemDescription}"
Additional Tagged Symptoms: ${symptomsList}`;

  // Try calling Groq API
  for (const model of GROQ_MODELS) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1, // low temperature for consistent JSON
          max_tokens: 300
        })
      });

      if (!response.ok) continue;

      const data = await response.json();
      const rawText = data.choices?.[0]?.message?.content?.trim();

      if (rawText) {
        // Strip markdown code fences if model included them
        const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
          priority: parsed.priority || 'MEDIUM',
          priorityLabel: parsed.priorityLabel || 'Moderate Priority',
          recommendedSpecialty: parsed.recommendedSpecialty || 'General Physician',
          triageSummary: parsed.triageSummary || 'Patient requesting instant consultation.',
          firstAidAdvice: parsed.firstAidAdvice || 'Sit comfortably and keep your airway clear while connecting to a doctor.',
          urgencyScore: Number(parsed.urgencyScore) || 2,
          modelUsed: model
        };
      }
    } catch (err) {
      console.warn(`Groq triage failed with model ${model}:`, err);
    }
  }

  // Fallback heuristic if offline or Groq fails
  return fallbackHeuristicTriage(problemDescription, symptoms);
}

/**
 * Intelligent Rule-Based Fallback Heuristic
 */
function fallbackHeuristicTriage(problem = '', symptoms = []) {
  const text = `${problem} ${symptoms.join(' ')}`.toLowerCase();

  // Critical indicators
  if (/chest pain|heart attack|stroke|can't breathe|cannot breathe|suffocating|unconscious|heavy bleeding|passed out|seizure/i.test(text)) {
    return {
      priority: 'CRITICAL',
      priorityLabel: 'Critical Emergency',
      recommendedSpecialty: 'Cardiologist',
      triageSummary: 'Patient reports severe, potentially life-threatening symptoms requiring immediate attention.',
      firstAidAdvice: 'Rest in a comfortable upright position, loosen tight clothing, and do not exert yourself.',
      urgencyScore: 4,
      modelUsed: 'heuristic-emergency'
    };
  }

  // High indicators
  if (/severe pain|high fever|fracture|broken bone|asthma|vomiting blood|intense migraine|burn/i.test(text)) {
    return {
      priority: 'HIGH',
      priorityLabel: 'High Priority',
      recommendedSpecialty: 'General Physician',
      triageSummary: 'Patient experiencing acute distress and needs prompt medical consultation.',
      firstAidAdvice: 'Stay calm, drink small sips of water, and keep warm while waiting for the doctor.',
      urgencyScore: 3,
      modelUsed: 'heuristic-high'
    };
  }

  // Medium indicators
  if (/fever|cough|cold|headache|rash|infection|stomach pain|diarrhea|throat/i.test(text)) {
    return {
      priority: 'MEDIUM',
      priorityLabel: 'Moderate Priority',
      recommendedSpecialty: 'General Physician',
      triageSummary: 'Patient reports common acute symptoms needing clinical guidance.',
      firstAidAdvice: 'Rest quietly and note down any medications you have recently taken.',
      urgencyScore: 2,
      modelUsed: 'heuristic-medium'
    };
  }

  // Low / Default
  return {
    priority: 'LOW',
    priorityLabel: 'Routine Consultation',
    recommendedSpecialty: 'General Physician',
    triageSummary: 'Patient requests general medical advice or routine health check.',
    firstAidAdvice: 'Keep your past prescription notes ready for the doctor.',
    urgencyScore: 1,
    modelUsed: 'heuristic-routine'
  };
}

const PRIMARY_COLLECTION = 'instant_calls';
const FALLBACK_COLLECTION = 'chats';

/**
 * Create an Instant Call in Firestore and notify doctors
 */
export async function createInstantCall(params) {
  try {
    const {
      patientId,
      patientName,
      patientPhone = '',
      problemDescription,
      symptoms = [],
      triage,
      targetDoctorId = 'any',
      targetDoctorName = 'Any Available Doctor'
    } = params;

    const roomId = `instant-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    const callDocData = {
      patientId,
      patientName: patientName || 'Patient',
      patientPhone,
      problemDescription,
      symptoms,
      priority: triage.priority,
      priorityLabel: triage.priorityLabel,
      recommendedSpecialty: triage.recommendedSpecialty,
      triageSummary: triage.triageSummary,
      firstAidAdvice: triage.firstAidAdvice,
      urgencyScore: triage.urgencyScore || 2,
      targetDoctorId,
      targetDoctorName,
      status: 'waiting', // 'waiting' | 'accepted' | 'completed' | 'cancelled'
      acceptedByDoctorId: null,
      acceptedByDoctorName: null,
      acceptedAt: null,
      callRoomId: roomId,
      createdAt: serverTimestamp(),
      _isInstantCall: true
    };

    let docRef;
    let collectionUsed = PRIMARY_COLLECTION;

    try {
      docRef = await addDoc(collection(db, PRIMARY_COLLECTION), callDocData);
    } catch (permErr) {
      const isPerm = permErr?.code === 'permission-denied' || 
        /permission|insufficient/i.test(permErr?.message || '');

      if (isPerm) {
        console.warn(`[InstantCall] Firestore denied '${PRIMARY_COLLECTION}'. Falling back to authorized '${FALLBACK_COLLECTION}' collection.`, permErr);
        collectionUsed = FALLBACK_COLLECTION;
        docRef = await addDoc(collection(db, FALLBACK_COLLECTION), {
          ...callDocData,
          _collectionUsed: FALLBACK_COLLECTION
        });
      } else {
        throw permErr;
      }
    }

    // If specific doctor targeted, create priority notification
    if (targetDoctorId && targetDoctorId !== 'any') {
      try {
        await notificationServices.createNotification({
          userId: targetDoctorId,
          title: `🚨 Instant Call (${triage.priority}): ${patientName}`,
          message: `${patientName} needs an instant consultation: "${problemDescription.substring(0, 80)}..."`,
          type: triage.priority === 'CRITICAL' ? 'error' : 'info',
          callId: docRef.id,
          callRoomId: roomId,
          category: 'instant_call'
        });
      } catch (notifErr) {
        console.warn('Could not dispatch doctor notification:', notifErr);
      }
    }

    return {
      callId: docRef.id,
      callRoomId: roomId,
      collectionName: collectionUsed,
      ...callDocData
    };
  } catch (error) {
    console.error('Error creating instant call:', error);
    throw error;
  }
}

/**
 * Doctor accepts an Instant Call using FIRST-COME, FIRST-SERVE (FCFS) atomic transaction
 */
export async function acceptInstantCall(callId, doctorUser, collectionName) {
  const tryAcceptInCollection = async (coll) => {
    const callRef = doc(db, coll, callId);

    return await runTransaction(db, async (transaction) => {
      const callDoc = await transaction.get(callRef);

      if (!callDoc.exists()) {
        throw new Error(`Call request not found in ${coll}`);
      }

      const data = callDoc.data();

      // STRICT FIRST-COME, FIRST-SERVE: check if another doctor already accepted
      if (data.status !== 'waiting') {
        return {
          success: false,
          reason: 'ALREADY_ACCEPTED',
          acceptedBy: data.acceptedByDoctorName || 'another doctor',
          callRoomId: data.callRoomId
        };
      }

      // Claim the call atomically
      transaction.update(callRef, {
        status: 'accepted',
        acceptedByDoctorId: doctorUser.uid || doctorUser.id,
        acceptedByDoctorName: doctorUser.displayName || doctorUser.name || 'Doctor',
        acceptedAt: serverTimestamp()
      });

      return {
        success: true,
        callRoomId: data.callRoomId,
        patientId: data.patientId,
        patientName: data.patientName,
        problemDescription: data.problemDescription
      };
    });
  };

  const primaryColl = collectionName || PRIMARY_COLLECTION;
  try {
    return await tryAcceptInCollection(primaryColl);
  } catch (err) {
    if (primaryColl !== FALLBACK_COLLECTION) {
      try {
        return await tryAcceptInCollection(FALLBACK_COLLECTION);
      } catch (fallbackErr) {
        console.error('Accept call failed on fallback:', fallbackErr);
      }
    }
    console.error('Error accepting instant call:', err);
    return {
      success: false,
      reason: err.message || 'FAILED_TO_ACCEPT'
    };
  }
}

/**
 * Cancel an active instant call
 */
export async function cancelInstantCall(callId, collectionName) {
  const tryCancelInCollection = async (coll) => {
    const callRef = doc(db, coll, callId);
    await updateDoc(callRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp()
    });
    return true;
  };

  try {
    return await tryCancelInCollection(collectionName || PRIMARY_COLLECTION);
  } catch (err) {
    try {
      return await tryCancelInCollection(FALLBACK_COLLECTION);
    } catch (fallbackErr) {
      console.error('Error cancelling instant call:', fallbackErr);
      return false;
    }
  }
}

/**
 * Doctor rejects / declines an instant call request with description
 */
export async function rejectInstantCall(callId, doctorUser, reason = 'Doctor currently unavailable', collectionName) {
  const tryRejectInCollection = async (coll) => {
    const callRef = doc(db, coll, callId);
    const callSnap = await getDoc(callRef);
    if (!callSnap.exists()) return false;

    const data = callSnap.data();
    const doctorId = doctorUser.uid || doctorUser.id;
    const doctorName = doctorUser.displayName || doctorUser.name || 'Doctor';

    const updatePayload = {
      declinedByDoctorIds: arrayUnion(doctorId),
      declinedLogs: arrayUnion({
        doctorId,
        doctorName,
        reason,
        declinedAt: new Date().toISOString()
      })
    };

    // If targeted doctor specifically declined, open it up to ALL available doctors so patient gets care
    if (data.targetDoctorId === doctorId) {
      updatePayload.targetDoctorId = 'any';
      updatePayload.targetDoctorName = 'Any Available Doctor (Re-routed)';
    }

    await updateDoc(callRef, updatePayload);
    return true;
  };

  try {
    const primaryColl = collectionName || PRIMARY_COLLECTION;
    const ok = await tryRejectInCollection(primaryColl);
    if (ok) return { success: true };
    if (primaryColl !== FALLBACK_COLLECTION) {
      const okFallback = await tryRejectInCollection(FALLBACK_COLLECTION);
      if (okFallback) return { success: true };
    }
    return { success: false, error: 'Call not found' };
  } catch (err) {
    try {
      const okFallback = await tryRejectInCollection(FALLBACK_COLLECTION);
      if (okFallback) return { success: true };
    } catch (_) {}
    console.error('Error declining instant call:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Real-time subscription to an Instant Call for patient or doctor
 */
export function subscribeToInstantCall(callId, callback, collectionName) {
  if (collectionName) {
    const callRef = doc(db, collectionName, callId);
    return onSnapshot(callRef, (docSnap) => {
      if (docSnap.exists()) {
        callback({ id: docSnap.id, collectionName, ...docSnap.data() });
      }
    }, (err) => {
      console.warn(`Instant call listener error on ${collectionName}:`, err);
    });
  }

  let unsubFallback = null;
  const primaryRef = doc(db, PRIMARY_COLLECTION, callId);

  const unsubPrimary = onSnapshot(primaryRef, (docSnap) => {
    if (docSnap.exists()) {
      callback({ id: docSnap.id, collectionName: PRIMARY_COLLECTION, ...docSnap.data() });
    } else if (!unsubFallback) {
      const fallbackRef = doc(db, FALLBACK_COLLECTION, callId);
      unsubFallback = onSnapshot(fallbackRef, (fSnap) => {
        if (fSnap.exists()) {
          callback({ id: fSnap.id, collectionName: FALLBACK_COLLECTION, ...fSnap.data() });
        }
      });
    }
  }, (err) => {
    console.warn('Instant call primary listener permission/network error, trying fallback:', err);
    if (!unsubFallback) {
      const fallbackRef = doc(db, FALLBACK_COLLECTION, callId);
      unsubFallback = onSnapshot(fallbackRef, (fSnap) => {
        if (fSnap.exists()) {
          callback({ id: fSnap.id, collectionName: FALLBACK_COLLECTION, ...fSnap.data() });
        }
      });
    }
  });

  return () => {
    if (unsubPrimary) unsubPrimary();
    if (unsubFallback) unsubFallback();
  };
}

/**
 * Real-time subscription to all waiting calls for doctors (First-Come, First-Serve list)
 * SHOWS NORMAL HEALTH ISSUES TO ALL DOCTORS!
 */
export function subscribeToWaitingInstantCalls(doctorId, callback) {
  let unsubActive = null;

  const processDocs = (snapshot, sourceColl) => {
    const calls = snapshot.docs
      .map(d => ({ id: d.id, collectionName: sourceColl, ...d.data() }))
      .filter(c => sourceColl === PRIMARY_COLLECTION || c._isInstantCall || c.callRoomId);

    // Filter calls:
    // 1. Exclude if this specific doctor has declined this call
    // 2. SHOW NORMAL HEALTH ISSUES TO ALL DOCTORS! (LOW, MEDIUM, or General Physician)
    // 3. Or targeted to this doctor specifically, or broadcast to any doctor
    const relevant = calls.filter(c => {
      if (c.status !== 'waiting') return false;

      // Exclude if already declined by this doctor
      if (doctorId && Array.isArray(c.declinedByDoctorIds) && c.declinedByDoctorIds.includes(doctorId)) {
        return false;
      }

      // Normal health issues are open to ALL doctors so patients get care quickly!
      const isNormalHealthIssue = 
        c.priority === 'LOW' || 
        c.priority === 'MEDIUM' || 
        (c.urgencyScore && c.urgencyScore <= 2) ||
        c.recommendedSpecialty === 'General Physician';

      if (isNormalHealthIssue) return true;

      // Broadcast calls or specifically targeted calls for this doctor
      return c.targetDoctorId === 'any' || c.targetDoctorId === doctorId;
    });

    // Sort by priority score (CRITICAL=4, HIGH=3, MEDIUM=2, LOW=1) and timestamp
    relevant.sort((a, b) => {
      const scoreDiff = (b.urgencyScore || 0) - (a.urgencyScore || 0);
      if (scoreDiff !== 0) return scoreDiff;
      const timeA = a.createdAt?.seconds || 0;
      const timeB = b.createdAt?.seconds || 0;
      return timeB - timeA;
    });

    callback(relevant);
  };

  const listenFallback = () => {
    try {
      const qFallback = query(
        collection(db, FALLBACK_COLLECTION),
        where('status', '==', 'waiting')
      );
      unsubActive = onSnapshot(qFallback, (snapshot) => {
        processDocs(snapshot, FALLBACK_COLLECTION);
      }, (fErr) => {
        console.warn('Waiting calls fallback error:', fErr);
      });
    } catch (err) {
      console.warn('Failed to listen to fallback:', err);
    }
  };

  try {
    const qPrimary = query(
      collection(db, PRIMARY_COLLECTION),
      where('status', '==', 'waiting')
    );
    unsubActive = onSnapshot(qPrimary, (snapshot) => {
      processDocs(snapshot, PRIMARY_COLLECTION);
    }, (err) => {
      const isPerm = err?.code === 'permission-denied' || /permission/i.test(err?.message || '');
      if (isPerm) {
        console.warn(`[InstantCall] Firestore permission denied on '${PRIMARY_COLLECTION}'. Switching listener to '${FALLBACK_COLLECTION}'.`);
        listenFallback();
      } else {
        console.warn('Waiting calls subscription error:', err);
      }
    });
  } catch (err) {
    listenFallback();
  }

  return () => {
    if (unsubActive) unsubActive();
  };
}
