import React from 'react';
import { View } from 'react-native';

import { withAlpha } from './projectProgressStats';

export const PROJECT_COMPLETE_COLOR = '#55B9A5';
const BAR_HEIGHT = 5;

interface ProjectProgressBarProps {
  color: string;
  ratio: number;
}

// Web/Tauri implementation. React sets the deterministic scale (so the bar is
// always correct, even under Hermes web where RN Animated is not driven) and
// CSS provides the spring and the one-shot completion highlight. The styles
// live in config/focusStyles.web.ts.
const ProjectProgressBar = ({ color, ratio }: ProjectProgressBarProps) => {
  const done = ratio >= 1;
  const clamped = Math.min(1, Math.max(0, ratio));
  const fillColor = done ? PROJECT_COMPLETE_COLOR : color;

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
      <View
        style={{
          backgroundColor: fillColor,
          borderRadius: BAR_HEIGHT,
          height: '100%',
          left: 0,
          position: 'absolute',
          top: 0,
          transform: [{ scaleX: clamped }],
          width: '100%',
        }}
        testID="lf-progress-fill"
      />
      {done ? (
        <View
          pointerEvents="none"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.55)',
            height: '100%',
            left: 0,
            position: 'absolute',
            top: 0,
            width: '32%',
          }}
          testID="lf-progress-shimmer"
        />
      ) : null}
    </View>
  );
};

export default ProjectProgressBar;
