import { useCallback, useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { GroupListItem } from '@splitpool/contracts';
import { GroupCard } from '../components/groups';
import { MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { interFace, interItalic } from '../fonts';
import { AppHeader, Button, ErrorBanner, Screen, colors, styles } from '../components/ui';
import { createGroup, formatApiError, listGroups } from '../lib/apiClient';
import { avatarFromProfile } from '../lib/peopleUi';
import { useAppProfile } from '../state/appProfile';
import { useAuth } from '../state/auth';
import { useDemo } from '../state/demo';

/** Signed-in groups home — demo chrome, live collaboration data. */
export default function ConnectedGroupsScreen() {
  const { profile } = useAuth();
  const { appProfile } = useAppProfile();
  const demo = useDemo();
  const [groups, setGroups] = useState<GroupListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const you = avatarFromProfile(
    appProfile ?? { userId: 'you', username: 'you', displayName: profile?.firstName || 'You' },
  );
  const firstName = profile?.firstName?.trim()
    || appProfile?.displayName?.trim().split(/\s+/)[0]
    || 'You';
  const yourFoodTitle = demo.you.title;

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      setGroups(await listGroups());
    } catch (error) {
      setMessage(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadGroups();
    }, [loadGroups]),
  );

  async function onCreateGroup() {
    const name = groupName.trim();
    if (!name) {
      setCreateError('Enter a group name.');
      return;
    }
    setBusy(true);
    setCreateError(null);
    try {
      const group = await createGroup(name);
      setGroupName('');
      setCreating(false);
      router.push({ pathname: '/group/[groupId]', params: { groupId: group.id } });
    } catch (error) {
      setCreateError(formatApiError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      header={<AppHeader title="SplitPool" />}
      footer={(
        <View style={{ gap: 10 }}>
          <Button title="+ New" onPress={() => { setCreateError(null); setCreating(true); }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Open your account, ${firstName}`}
            onPress={() => router.push('/account')}
            style={dock}
          >
            <MemberAvatar person={you} size={36} />
            <Text style={dockLabel}>{firstName}</Text>
          </Pressable>
        </View>
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Your title, ${yourFoodTitle || 'none yet'}`}
        onPress={() => router.push('/account')}
        style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}
      >
        <Text style={yourTitle}>{yourFoodTitle ? `“${yourFoodTitle}”` : 'Your next meal has a title'}</Text>
      </Pressable>

      <View style={styles.row}>
        <Text style={groupsHeading}>Groups</Text>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => void loadGroups()} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={styles.link}>{loading ? 'Loading…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {message && <ErrorBanner message={message} />}

      {!loading && groups.length === 0 && (
        <Text style={styles.small}>No groups yet.</Text>
      )}

      <View style={{ gap: 18 }}>
        {groups.map((group) => (
          <GroupCard
            key={group.id}
            id={group.id}
            name={group.name}
            members={group.members.map((member) => avatarFromProfile(member))}
            recent={group.recentMerchant ?? undefined}
            onPress={() => router.push({ pathname: '/group/[groupId]', params: { groupId: group.id } })}
          />
        ))}
      </View>

      <BottomSheet
        visible={creating}
        title="New group"
        onClose={() => setCreating(false)}
        footer={<Button title={busy ? 'Creating…' : 'Create group'} disabled={busy} onPress={() => void onCreateGroup()} />}
      >
        <Text style={styles.label}>Group name</Text>
        <TextInput
          accessibilityLabel="Group name"
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Friday dinner"
          placeholderTextColor={colors.muted}
          style={styles.input}
          maxLength={100}
        />
        {createError && <ErrorBanner message={createError} />}
      </BottomSheet>
    </Screen>
  );
}

const yourTitle = {
  fontSize: 21,
  lineHeight: 26,
  color: colors.ink,
  ...Platform.select({
    web: { fontFamily: 'Inter', fontWeight: '400' as const, fontStyle: 'italic' as const },
    default: { fontFamily: interItalic, fontWeight: 'normal' as const, fontStyle: 'normal' as const },
  }),
};
const groupsHeading = { fontFamily: 'Inter', fontSize: 22, lineHeight: 28, fontWeight: '600' as const, color: colors.ink };
const dock = { minHeight: 44, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 };
const dockLabel = { ...interFace(600), fontSize: 14, color: colors.ink };
