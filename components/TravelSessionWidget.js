import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '../styles/theme';

const DRAG_START = { x: 22, y: 120 };
const EDGE_MARGIN = 12;
const WIDGET_WIDTH = 150;
const TOP_MARGIN = 70;
const BOTTOM_MARGIN = 120;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

export default function TravelSessionWidget({ onPress }) {
  const pan = useRef(new Animated.ValueXY(DRAG_START)).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
        onPanResponderGrant: () => {
          pan.setOffset({ x: pan.x.__getValue(), y: pan.y.__getValue() });
          pan.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        }),
        onPanResponderRelease: () => {
          pan.flattenOffset();

          const currentX = pan.x.__getValue();
          const currentY = pan.y.__getValue();

          const leftSnapX = EDGE_MARGIN;
          const rightSnapX = SCREEN_WIDTH - WIDGET_WIDTH - EDGE_MARGIN;
          const shouldSnapRight = currentX + WIDGET_WIDTH / 2 > SCREEN_WIDTH / 2;

          const targetX = shouldSnapRight ? rightSnapX : leftSnapX;
          const targetY = clamp(currentY, TOP_MARGIN, SCREEN_HEIGHT - BOTTOM_MARGIN);

          Animated.spring(pan, {
            toValue: { x: targetX, y: targetY },
            useNativeDriver: false,
            tension: 120,
            friction: 14,
          }).start();
        },
      }),
    [pan]
  );

  return (
    <Animated.View
      style={[
        styles.wrapper,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity style={styles.card} activeOpacity={0.9} onPress={onPress}>
        <MaterialIcons name="navigation" size={16} color={theme.colors.primary} />
        <View style={styles.textGroup}>
          <Text style={styles.title}>Trip started</Text>
          <Text style={styles.subtitle}>Tap to return</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 5,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#ECECEC',
  },
  textGroup: {
    marginLeft: 8,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: '#222',
  },
  subtitle: {
    fontSize: 11,
    color: '#666',
    marginTop: 1,
  },
});
