import { Image, Pressable, StyleSheet, View } from 'react-native';
import { colors } from './ui';

export function ProfileIconButton({
  avatarUrl,
  onPress,
}: {
  avatarUrl?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open profile"
      hitSlop={12}
      onPress={onPress}
      style={({ pressed }) => [styles.hit, pressed && { opacity: 0.7 }]}
    >
      {avatarUrl ? (
        <Image accessibilityIgnoresInvertColors source={{ uri: avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.glyph}>
          <View style={styles.head} />
          <View style={styles.shoulders} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hit: {
    marginRight: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.light,
  },
  glyph: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  head: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
    marginBottom: 2,
  },
  shoulders: {
    width: 20,
    height: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: colors.primary,
  },
});
