/**
 * 📱 Real-Time Monitoring Screen
 * 
 * UI for:
 * - Starting/stopping real-time threat monitoring
 * - Displaying live sensor telemetry
 * - Showing threat history with emotion analysis
 * - Manual emergency trigger
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRealtimeThreat } from '../context/RealtimeThreatContext';
import { useDangerAlert } from '../context/DangerAlertContext';
import theme from '../styles/theme';
import DangerPopupModal from '../components/DangerPopupModal';

const RealtimeMonitoringScreen = ({ navigation }) => {
  // Contexts
  const realtimeThreat = useRealtimeThreat();
  const dangerAlert = useDangerAlert();
  const [showThreatHistory, setShowThreatHistory] = useState(false);

  // ════════════════════════════════════════
  // RENDER HELPERS
  // ════════════════════════════════════════

  const getRiskColor = (riskLevel) => {
    switch (riskLevel) {
      case 'HIGH':
        return '#FF4444'; // Red
      case 'MEDIUM':
        return '#FFA500'; // Orange
      case 'LOW':
        return '#FFA500'; // Orange
      default:
        return '#4CAF50'; // Green
    }
  };

  const getCalibrationColor = (status) => {
    if (status === 'complete') return '#4CAF50'; // Green
    if (status && status.includes('Calibrating')) return '#FFA500'; // Orange
    return '#999'; // Gray
  };

  const getTriggerType = (threat) => {
    const triggers = [];
    if (threat.emotion === 'fear' || threat.emotion === 'angry') triggers.push('Emotion');
    if (threat.heart_rate > 100) triggers.push('HR');
    if (threat.motion > 5) triggers.push('Motion');
    return triggers.join('+') || 'Unknown';
  };

  // ════════════════════════════════════════
  // THREAT CARD COMPONENT
  // ════════════════════════════════════════

  const ThreatCard = ({ threat }) => (
    <View style={styles.threatCard}>
      <View
        style={[
          styles.threatCardIndicator,
          { backgroundColor: getRiskColor(threat.risk_level) },
        ]}
      />
      <View style={styles.threatCardContent}>
        <Text style={styles.threatTime}>
          {new Date(threat.timestamp).toLocaleTimeString()}
        </Text>
        <Text style={styles.threatEmoji}>
          Emotion: {threat.emotion} {threat.emotion_confidence}%
        </Text>
        <Text style={styles.threatMetric}>
          ❤️ HR: {threat.heart_rate} bpm | 🎯 Risk: {threat.risk_level}
        </Text>
        <Text style={styles.threatDetail}>
          Trigger: {getTriggerType(threat)} • Confidence: {threat.confidence}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          // Could open detailed view or audio playback
          console.log('View threat:', threat.id);
        }}
      >
        <MaterialCommunityIcons name="chevron-right" size={24} color="#999" />
      </TouchableOpacity>
    </View>
  );

  // ════════════════════════════════════════
  // LIVE TELEMETRY WIDGET
  // ════════════════════════════════════════

  const LiveTelemetryWidget = () => (
    <View style={styles.liveWidget}>
      <Text style={styles.sectionTitle}>📊 Live Telemetry</Text>

      <View style={styles.metricsGrid}>
        {/* Heart Rate */}
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>❤️ Heart Rate</Text>
          <Text style={styles.metricValue}>{realtimeThreat.liveMetrics.heartRate}</Text>
          <Text style={styles.metricUnit}>bpm</Text>
        </View>

        {/* Motion */}
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>🎯 Motion</Text>
          <Text style={styles.metricValue}>
            {realtimeThreat.liveMetrics.motionMagnitude.toFixed(1)}
          </Text>
          <Text style={styles.metricUnit}>°</Text>
        </View>

        {/* Audio Level */}
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>🔊 Audio</Text>
          <Text style={styles.metricValue}>{realtimeThreat.liveMetrics.audioLevel}</Text>
          <Text style={styles.metricUnit}>/100</Text>
        </View>

        {/* Status */}
        <View style={styles.metricBox}>
          <Text style={styles.metricLabel}>📡 Status</Text>
          <Text
            style={[
              styles.metricValue,
              { color: realtimeThreat.isMonitoring ? '#4CAF50' : '#FF4444' },
            ]}
          >
            {realtimeThreat.isMonitoring ? 'LIVE' : 'IDLE'}
          </Text>
          <Text style={styles.metricUnit}>—</Text>
        </View>
      </View>
    </View>
  );

  // ════════════════════════════════════════
  // CALIBRATION STATUS
  // ════════════════════════════════════════

  const CalibrationStatus = () => (
    <View
      style={[
        styles.calibrationBox,
        {
          borderLeftColor: getCalibrationColor(realtimeThreat.calibrationStatus),
        },
      ]}
    >
      <MaterialCommunityIcons
        name={
          realtimeThreat.calibrationStatus === 'complete'
            ? 'check-circle'
            : 'clock-outline'
        }
        size={20}
        color={getCalibrationColor(realtimeThreat.calibrationStatus)}
      />
      <Text style={styles.calibrationText}>{realtimeThreat.calibrationStatus}</Text>
    </View>
  );

  // ════════════════════════════════════════
  // STATS SUMMARY
  // ════════════════════════════════════════

  const StatsSummary = () => (
    <View style={styles.statsContainer}>
      <Text style={styles.sectionTitle}>📈 Statistics</Text>
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{realtimeThreat.stats.totalCaptures}</Text>
          <Text style={styles.statLabel}>Total Captures</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#FF4444' }]}>
            {realtimeThreat.stats.highRiskCount}
          </Text>
          <Text style={styles.statLabel}>High Risk</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#FFA500' }]}>
            {realtimeThreat.stats.mediumRiskCount}
          </Text>
          <Text style={styles.statLabel}>Medium Risk</Text>
        </View>
      </View>
    </View>
  );

  const TriggerPanel = () => (
    <View style={styles.triggerContainer}>
      <Text style={styles.sectionTitle}>⚡ Current Triggers</Text>
      {realtimeThreat.recentTriggers.length === 0 ? (
        <Text style={styles.triggerEmpty}>No active triggers right now.</Text>
      ) : (
        realtimeThreat.recentTriggers.map((trigger, index) => (
          <View key={`${trigger.type}-${index}`} style={styles.triggerRow}>
            <Text style={styles.triggerType}>{trigger.type}</Text>
            <Text style={styles.triggerDesc}>{trigger.description}</Text>
          </View>
        ))
      )}
    </View>
  );

  // ════════════════════════════════════════
  // MAIN RENDER
  // ════════════════════════════════════════

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>🚨 Real-Time Threat Detection</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Menu')}
            style={styles.headerButton}
          >
            <MaterialCommunityIcons name="menu" size={24} color="#000" />
          </TouchableOpacity>
        </View>

        {/* Monitoring Control */}
        <View style={styles.controlSection}>
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information" size={20} color="#2196F3" />
            <Text style={styles.infoText}>
              Monitoring auto-starts when the watch connects and auto-stops when it disconnects.
              Triggers are checked continuously from live heart rate, motion, and audio level.
            </Text>
          </View>

          <CalibrationStatus />
          <LiveTelemetryWidget />
          <TriggerPanel />
          <StatsSummary />
        </View>

        {/* Last Threat Detected */}
        {realtimeThreat.lastThreatDetected && (
          <View style={styles.lastThreatSection}>
            <Text style={styles.sectionTitle}>🔴 Last Threat Detected</Text>
            <ThreatCard threat={realtimeThreat.lastThreatDetected} />
          </View>
        )}

        {/* Threat History */}
        {realtimeThreat.threats.length > 0 && (
          <View style={styles.historySection}>
            <TouchableOpacity
              style={styles.historyHeader}
              onPress={() => setShowThreatHistory(!showThreatHistory)}
            >
              <Text style={styles.sectionTitle}>📋 Threat History ({realtimeThreat.threats.length})</Text>
              <MaterialCommunityIcons
                name={showThreatHistory ? 'chevron-up' : 'chevron-down'}
                size={24}
                color="#000"
              />
            </TouchableOpacity>

            {showThreatHistory && (
              <FlatList
                scrollEnabled={false}
                data={realtimeThreat.threats}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => <ThreatCard threat={item} />}
              />
            )}
          </View>
        )}

        {/* Manual Emergency Button */}
        <View style={styles.emergencySection}>
          <TouchableOpacity
            style={styles.emergencyButton}
            onPress={() => {
              if (dangerAlert?.showDangerAlert) {
                dangerAlert.showDangerAlert();
              }
            }}
          >
            <MaterialCommunityIcons name="alert" size={32} color="#fff" />
            <Text style={styles.emergencyButtonText}>Manual SOS</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>💡 Tip: Monitor threat detections regularly</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AlertsScreen')}>
            <Text style={styles.footerLink}>View full threat history →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* DangerPopupModal Reused */}
      <DangerPopupModal />
    </SafeAreaView>
  );
};

// ════════════════════════════════════════
// STYLES
// ════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scroll: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  headerButton: {
    padding: 8,
  },
  controlSection: {
    padding: 16,
    gap: 12,
    marginBottom: 16,
  },
  startButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  stopButton: {
    backgroundColor: '#FF4444',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  buttonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#1976D2',
    lineHeight: 18,
  },
  calibrationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
  },
  calibrationText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 12,
  },
  liveWidget: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  metricLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  metricUnit: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  statsContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  triggerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  triggerEmpty: {
    color: '#777',
    fontSize: 13,
  },
  triggerRow: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF4444',
  },
  triggerType: {
    fontSize: 13,
    fontWeight: '700',
    color: '#d32f2f',
    marginBottom: 4,
  },
  triggerDesc: {
    fontSize: 12,
    color: '#444',
    lineHeight: 17,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  lastThreatSection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  threatCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  threatCardIndicator: {
    width: 4,
  },
  threatCardContent: {
    flex: 1,
    padding: 12,
    gap: 4,
  },
  threatTime: {
    fontSize: 12,
    color: '#999',
  },
  threatEmoji: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  threatMetric: {
    fontSize: 12,
    color: '#555',
  },
  threatDetail: {
    fontSize: 11,
    color: '#777',
    marginTop: 4,
  },
  historySection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  emergencySection: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  emergencyButton: {
    backgroundColor: '#FF0000',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emergencyButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    fontSize: 12,
    color: '#999',
  },
  footerLink: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
});

export default RealtimeMonitoringScreen;
