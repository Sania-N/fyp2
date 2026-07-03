// components/DangerPopupModal.js
import React, { useEffect, useRef, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDangerAlert } from '../context/DangerAlertContext';
import { triggerSOSAlert } from '../services/sosService';
import { addGeoFenceAlertHistoryItem } from '../services/geoFenceService';
import theme from '../styles/theme';

export default function DangerPopupModal() {
  const { isVisible, timer, isCountingDown, hideDangerAlert, updateTimer } = useDangerAlert();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const timerIntervalRef = useRef(null);
  const sosTriggeredRef = useRef(false);
  const countdownStartedRef = useRef(false);

  // Handle timer expiration - trigger SOS
  const handleTimerExpired = useCallback(async () => {
    if (sosTriggeredRef.current) return; // Prevent duplicate SOS calls
    sosTriggeredRef.current = true;

    console.log('⏰ Danger alert timer expired - triggering SOS');
    await addGeoFenceAlertHistoryItem({
      message: 'No response received in safety popup. Timer expired and auto-SOS was triggered.',
      eventType: 'SAFETY_TIMEOUT',
      details: {
        timerRemaining: 0,
        action: 'AUTO_SOS_TRIGGERED',
      },
    });
    Vibration.vibrate([0, 150, 100, 150, 100, 150]); // Urgent vibration pattern

    try {
      const result = await triggerSOSAlert();
      console.log('SOS trigger result:', result);

      if (result.success) {
        await addGeoFenceAlertHistoryItem({
          message: `SOS sent successfully to emergency contact ${result.contactName || ''}`.trim(),
          eventType: 'SOS_SENT',
          details: {
            sosSent: true,
            contactName: result.contactName || null,
          },
        });
        Alert.alert(
          '🚨 SOS TRIGGERED',
          `Emergency alert has been sent to ${result.contactName}.\n\nWhatsApp will open to confirm.`,
          [{ text: 'OK' }]
        );
      } else {
        await addGeoFenceAlertHistoryItem({
          message: `SOS send failed: ${result.message || 'Unknown failure'}`,
          eventType: 'SOS_FAILED',
          details: {
            sosSent: false,
            reason: result.message || 'Unknown failure',
          },
        });
        Alert.alert(
          '⚠️ SOS Trigger Failed',
          result.message || 'Could not send SOS alert',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error triggering SOS:', error);
      Alert.alert('Error', 'Failed to trigger SOS alert');
    } finally {
      hideDangerAlert();
      sosTriggeredRef.current = false;
    }
  }, [hideDangerAlert]);

  // Trigger vibration when modal appears
  useEffect(() => {
    if (isVisible) {
      // Vibration pattern: strong pulse when danger detected
      Vibration.vibrate([0, 200, 100, 200, 100, 200]);

      // Animate modal entrance
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 10,
      }).start();
    } else {
      scaleAnim.setValue(0);
    }
  }, [isVisible, scaleAnim]);

  // Timer countdown effect
  useEffect(() => {
    if (isVisible && isCountingDown && timer > 0 && !timerIntervalRef.current) {
      countdownStartedRef.current = true;
      timerIntervalRef.current = setInterval(() => {
        updateTimer((prevTime) => {
          const newTime = prevTime - 1;
          if (newTime <= 0) {
            // Timer expired - trigger SOS
            clearInterval(timerIntervalRef.current);
            handleTimerExpired();
            return 0;
          }
          return newTime;
        });
      }, 1000);

      return () => {
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        countdownStartedRef.current = false;
      };
    }
    if (!isVisible || !isCountingDown || timer <= 0) {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
      countdownStartedRef.current = false;
    }
  }, [isVisible, isCountingDown, updateTimer, handleTimerExpired]);

  const handleSafeButtonPress = () => {
    // User is safe - stop timer and hide modal
    Vibration.vibrate(100);
    addGeoFenceAlertHistoryItem({
      message: `Safety button pressed by user with ${timer}s remaining. Auto-SOS canceled.`,
      eventType: 'SAFETY_CONFIRMED',
      details: {
        buttonPressed: true,
        timerRemaining: timer,
        action: 'AUTO_SOS_CANCELED',
      },
    });
    hideDangerAlert();
  };

  const getTimerColor = () => {
    if (timer <= 10) return '#E74C3C'; // Red when critical
    if (timer <= 30) return '#F39C12'; // Orange when mid
    return '#3498DB'; // Blue otherwise
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="fade"
      onRequestPress={() => {
        // Prevent dismissal by back press
        return true;
      }}
    >
      <View style={styles.overlayContainer}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Alert Icon */}
          <View style={styles.iconContainer}>
            <MaterialIcons name="warning-amber" size={56} color="#E74C3C" />
          </View>

          {/* Title */}
          <Text style={styles.title}>Are you safe?</Text>
          <Text style={styles.subtitle}>
            We detected potential danger. Confirm your safety immediately.
          </Text>

          {/* Timer Display */}
          <View style={styles.timerSection}>
            <Text style={[styles.timerText, { color: getTimerColor() }]}>
              {timer}
            </Text>
            <Text style={styles.timerLabel}>seconds</Text>
            <View style={styles.timerBorder} />
            <Text style={styles.warningText}>
              Auto-triggering SOS in {timer}s if no response
            </Text>
          </View>

          {/* Safety Button */}
          <TouchableOpacity
            style={styles.safeButton}
            onPress={handleSafeButtonPress}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check-circle" size={24} color="#FFF" />
            <Text style={styles.safeButtonText}>I AM SAFE</Text>
          </TouchableOpacity>

          {/* Safety Tips */}
          <View style={styles.tipsContainer}>
            <Text style={styles.tipText}>
              💡 Tap "I AM SAFE" if you're fine or if it's a false alarm.
            </Text>
            <Text style={styles.tipText}>
              ⏰ If unresponsive, SOS will auto-trigger to your emergency contact.
            </Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(4px)',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 25,
    borderWidth: 2,
    borderColor: '#FEECEC',
  },
  iconContainer: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 50,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E1E1E',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  timerSection: {
    alignItems: 'center',
    marginBottom: 28,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E8E8E8',
    width: '100%',
  },
  timerText: {
    fontSize: 64,
    fontWeight: '900',
    marginBottom: 4,
  },
  timerLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  timerBorder: {
    width: 40,
    height: 2,
    backgroundColor: '#E74C3C',
    marginVertical: 12,
    borderRadius: 1,
  },
  warningText: {
    fontSize: 12,
    color: '#B42318',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  safeButton: {
    backgroundColor: '#27AE60',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#27AE60',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    width: '100%',
  },
  safeButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 10,
  },
  tipsContainer: {
    backgroundColor: 'rgba(52, 152, 219, 0.05)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3498DB',
    width: '100%',
  },
  tipText: {
    fontSize: 12,
    color: '#2C3E50',
    marginVertical: 4,
    lineHeight: 16,
  },
});
