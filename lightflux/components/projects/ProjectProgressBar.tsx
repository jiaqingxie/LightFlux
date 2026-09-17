import React, { useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';

import { withAlpha } from './projectProgressStats';

export const PROJECT_COMPLETE_COLOR = '#55B9A5';
const BAR_HEIGHT = 5;

const prefersReducedMotion = (): boolean =>
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface ProjectProgressBarProps {
  color: string;
  ratio: number;
}

// Compact animated completion strip shown inside each project card header.
// The fill uses the project's own color and springs to the new ratio with a
// scale transform anchored to the left. Reaching 100% turns it teal and a
// highlight sweeps across once as a small, non-looping reward. Transforms are
// used (not animated width) because they animate on every target platform.
const ProjectProgressBar = ({ color, ratio }: ProjectProgressBarProps) => {
  const progress = useRef(new Animated.Value(ratio)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const wasComplete = useRef(false);
  const reducedMotion = prefersReducedMotion();
  const done = ratio >= 1;
  const fillColor = done ? PROJECT_COMPLETE_COLOR : color;

  const shimmerTranslate = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: ['-120%', '420%'],
  });
  const shimmerOpacity = shimmer.interpolate({
    inputRange: [0, 0.25, 0.75, 1],
    outputRange: [0, 0.85, 0.85, 0],
  });

  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(ratio);
      return;
    }
    Animated.timing(progress, {
      duration: 480,
      toValue: ratio,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [progress, ratio, reducedMotion]);

  useEffect(() => {
    if (!done) {
      wasComplete.current = false;
      return;
    }
    if (wasComplete.current || reducedMotion) {
      return;
    }
    wasComplete.current = true;
    shimmer.setValue(0);
    Animated.sequence([
      Animated.delay(160),
      Animated.timing(shimmer, {
        duration: 900,
        easing: (value) =>
          value < 0.5
            ? 2 * value * value
            : 1 - Math.pow(-2 * value + 2, 2) / 2,
        toValue: 1,
        useNativeDriver: Platform.OS !== 'web',
      }),
    ]).start();
  }, [done, reducedMotion, shimmer]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: Math.round(ratio * 100) }}
      style={{
        backgroundColor: withAlpha(color, 0.14),
        borderRadius: BAR_HEIGHT,
        height: BAR_HEIGHT,
        marginTop: 9,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <Animated.View
        style={{
          backgroundColor: fillColor,
          borderRadius: BAR_HEIGHT,
          height: '100%',
          left: 0,
          position: 'absolute',
          top: 0,
          transform: [{ scaleX: progress }],
          transformOrigin: 'left center',
          width: '100%',
        }}
      />
      {done && !reducedMotion ? (
        <Animated.View
          pointerEvents="none"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
            height: '100%',
            left: 0,
            opacity: shimmerOpacity,
            position: 'absolute',
            top: 0,
            transform: [{ translateX: shimmerTranslate }],
            width: '32%',
          }}
        />
      ) : null}
    </View>
  );
};

export default ProjectProgressBar;
