import React, { useCallback, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import theme from '../styles/theme';
import { getGeoFenceAlertHistory } from '../services/geoFenceService';

const formatAlertTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp || '';
  }
};

const formatAlertClockTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString();
  } catch {
    return '';
  }
};

const isSameLocalDay = (timestamp, referenceDate = new Date()) => {
  const alertDate = new Date(timestamp);
  if (Number.isNaN(alertDate.getTime())) {
    return false;
  }

  return (
    alertDate.getFullYear() === referenceDate.getFullYear() &&
    alertDate.getMonth() === referenceDate.getMonth() &&
    alertDate.getDate() === referenceDate.getDate()
  );
};

const toSafeNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildDetailsText = (alert) => {
  const details = alert?.details || {};
  const parts = [];

  const timeText = formatAlertClockTime(alert?.timestamp);
  if (timeText) parts.push(`Time: ${timeText}`);

  if (details.emotion) parts.push(`Emotion: ${details.emotion}`);

  const confidence = toSafeNumber(details.emotionConfidence);
  if (confidence !== null) parts.push(`Confidence: ${confidence.toFixed(3)}`);

  const motion = toSafeNumber(details.motion);
  if (motion !== null) parts.push(`Motion: ${motion.toFixed(2)}`);

  const heartRate = toSafeNumber(details.heartRate);
  if (heartRate !== null) parts.push(`Heart rate: ${heartRate.toFixed(0)} bpm`);

  if (details.riskLevel) parts.push(`Risk: ${details.riskLevel}`);
  if (details.buttonPressed === true) parts.push('Button: Pressed');
  if (details.sosSent === true) parts.push('SOS: Sent');
  if (details.sosSent === false) parts.push('SOS: Failed');
  if (details.contactName) parts.push(`Contact: ${details.contactName}`);
  if (details.reason) parts.push(`Reason: ${details.reason}`);
  if (details.action) parts.push(`Action: ${details.action}`);
  if (toSafeNumber(details.timerRemaining) !== null) {
    parts.push(`Timer remaining: ${Number(details.timerRemaining)}s`);
  }

  if (parts.length === 0) {
    const fallbackTime = formatAlertClockTime(alert?.timestamp);
    return fallbackTime ? `Time: ${fallbackTime}` : '';
  }

  return parts.join(' | ');
};

export default function AlertsScreen() {
  const navigation = useNavigation();
  const [alerts, setAlerts] = useState([]);

  const loadAlerts = useCallback(async () => {
    const items = await getGeoFenceAlertHistory();
    const todaysItems = items.filter((item) => isSameLocalDay(item?.timestamp));
    setAlerts(todaysItems);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAlerts();
    }, [loadAlerts])
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Alerts</Text>
        <View style={styles.headerSpacer} />
      </View>

      {alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="notifications-none" size={44} color="#888" />
          <Text style={styles.emptyTitle}>No alerts yet</Text>
          <Text style={styles.emptySubtitle}>Red and orange zone alerts will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.alertCard}>
              <View style={styles.alertRow}>
                <MaterialIcons name="warning-amber" size={18} color="#B42318" />
                <Text style={styles.alertMessage}>{item.message}</Text>
              </View>
              <Text style={styles.alertDetails}>Details: {buildDetailsText(item)}</Text>
              <Text style={styles.alertTime}>{formatAlertTime(item.timestamp)}</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E6E6',
    backgroundColor: '#FFF',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  headerSpacer: {
    width: 36,
  },
  listContent: {
    padding: 14,
  },
  alertCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#EEE',
    marginBottom: 10,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertMessage: {
    marginLeft: 8,
    flex: 1,
    color: '#1E1E1E',
    fontSize: 14,
    fontWeight: '600',
  },
  alertTime: {
    marginTop: 8,
    color: '#666',
    fontSize: 12,
  },
  alertDetails: {
    marginTop: 8,
    color: '#4A4A4A',
    fontSize: 12,
    lineHeight: 18,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
  },
});
