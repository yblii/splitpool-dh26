import { useState } from 'react';
import { Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { GroupCard } from '../components/groups';
import { AvatarStack, MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { interFace, interItalic } from '../fonts';
import { AppHeader, Button, ErrorBanner, Screen, colors, styles } from '../components/ui';
import { useAppProfile } from '../state/appProfile';
import { useAuth } from '../state/auth';
import { useDemo } from '../state/demo';

export default function GroupsScreen() {
  const demo = useDemo();
  const { session, isLoading } = useAuth();
  const { status } = useAppProfile();
  const params = useLocalSearchParams<{ local?: string | string[] }>();
  const localFlag = Array.isArray(params.local) ? params.local[0] : params.local;
  const stayOnDemo = localFlag === '1' || localFlag === 'true';
  const [creating, setCreating] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friendName, setFriendName] = useState('');
  const [friendMessage, setFriendMessage] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>(() => demo.groups.map((group) => group.id));
  const missingGroup = demo.groups.some((group) => !order.includes(group.id));
  const staleGroup = order.some((id) => !demo.groups.some((group) => group.id === id));
  if (missingGroup || staleGroup) {
    const kept = order.filter((id) => demo.groups.some((group) => group.id === id));
    const added = demo.groups.map((group) => group.id).filter((id) => !kept.includes(id));
    setOrder([...kept, ...added]);
  }

  // Connected (signed-in) groups are the default home. Opt into the local demo with ?local=1.
  if (!stayOnDemo && (isLoading || (session && status === 'loading'))) {
    return null;
  }
  if (!isLoading && session && status === 'ready' && !stayOnDemo) {
    return <Redirect href="/connected" />;
  }
  if (!isLoading && session && status === 'needsSetup' && !stayOnDemo) {
    return <Redirect href="/profile-setup" />;
  }

  function openGroup(id: string) {
    demo.selectGroup(id);
    router.push({ pathname: '/group', params: { id } });
  }

  function createGroup() {
    const result = demo.createGroup(groupName, selected);
    if ('error' in result) {
      setCreateError(result.error);
      return;
    }
    setCreating(false);
    setGroupName('');
    setSelected([]);
    setCreateError(null);
    router.push({ pathname: '/group', params: { id: result.id } });
  }

  function addFriend() {
    const result = demo.addFriend(friendName);
    if (!result.ok) {
      setFriendError(result.message);
      setFriendMessage(null);
      return;
    }
    setFriendName('');
    setFriendError(null);
    setFriendMessage(`${result.person.name} was added.`);
  }

  const byId = new Map(demo.groups.map((group) => [group.id, group]));
  const ordered = order.map((id) => byId.get(id)).filter((group): group is NonNullable<typeof group> => !!group && !hidden.includes(group.id));
  const hiddenGroups = order.map((id) => byId.get(id)).filter((group): group is NonNullable<typeof group> => !!group && hidden.includes(group.id));
  const pickedIsHidden = !!pickedId && hidden.includes(pickedId);

  function moveGroup(id: string, slots: number) {
    setOrder((current) => {
      const visibleIds = current.filter((entry) => !hidden.includes(entry));
      const from = visibleIds.indexOf(id);
      const to = Math.max(0, Math.min(visibleIds.length - 1, from + slots));
      if (from < 0 || from === to) return current;
      const next = [...visibleIds];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return [...next, ...current.filter((entry) => hidden.includes(entry))];
    });
  }

  function togglePicked() {
    if (!pickedId) return;
    const hiding = !hidden.includes(pickedId);
    setHidden((current) => hiding ? [...current, pickedId] : current.filter((id) => id !== pickedId));
    if (hiding) setShowHidden(true);
  }

  return <Screen
    header={<AppHeader title="SplitPool" right={<Pressable accessibilityRole="button" accessibilityLabel="New group" hitSlop={8} onPress={() => { setCreateError(null); setCreating(true); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text style={styles.link}>+ New</Text>
    </Pressable>} />}
    footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/profile')} style={dock}>
        <MemberAvatar person={demo.you} size={36} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open friends" onPress={() => { setFriendError(null); setFriendsOpen(true); }} style={dock}>
        <AvatarStack people={demo.friends} size={28} />
        <Text style={dockLabel}>Friends</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open shared groups"
        onPress={() => router.replace('/connected')}
        style={dock}
      >
        <Text style={dockLabel}>Shared</Text>
      </Pressable>
    </View>}
  >
    <Pressable accessibilityRole="button" accessibilityLabel={`Your title, ${demo.you.title}`} onPress={() => router.push('/profile')} style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}>
      <Text style={yourTitle}>{demo.you.title ? `“${demo.you.title}”` : 'Your next meal has a title'}</Text>
    </Pressable>
    <View style={styles.row}>
      <Text style={groupsHeading}>Groups</Text>
      {editing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={pickedIsHidden ? 'Show selected group' : 'Hide selected group'} disabled={!pickedId} onPress={togglePicked} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[styles.link, { opacity: pickedId ? 1 : 0.35 }]}>{pickedIsHidden ? 'Show' : 'Hide'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Done editing groups" onPress={() => { setEditing(false); setPickedId(null); }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={styles.link}>Done</Text>
        </Pressable>
      </View> : <Pressable accessibilityRole="button" accessibilityLabel="Edit groups" onPress={() => setEditing(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={styles.link}>Edit</Text>
      </Pressable>}
    </View>
    {editing && <Text style={styles.small}>Select a group, then Hide. Drag a group up or down to reorder.</Text>}
    <View style={{ gap: 18 }}>
      {ordered.map((group) => <GroupCard
        key={group.id}
        id={group.id}
        name={group.name}
        members={group.memberIds.map((id) => demo.lookup(id))}
        recent={demo.pastBills.find((entry) => entry.groupId === group.id)?.merchant}
        editing={editing}
        selected={pickedId === group.id}
        onPress={() => editing ? setPickedId(group.id) : openGroup(group.id)}
        onDrag={(slots) => moveGroup(group.id, slots)}
      />)}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHidden }} onPress={() => setShowHidden((current) => !current)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={styles.text}>{showHidden ? '⌄' : '›'} Hidden</Text>
    </Pressable>
    {showHidden && hiddenGroups.length === 0 && <Text style={styles.small}>Hidden groups show up here.</Text>}
    {showHidden && <View style={{ gap: 18 }}>
      {hiddenGroups.map((group) => <GroupCard
        key={group.id}
        id={group.id}
        name={group.name}
        members={group.memberIds.map((id) => demo.lookup(id))}
        recent={demo.pastBills.find((entry) => entry.groupId === group.id)?.merchant}
        editing={editing}
        selected={pickedId === group.id}
        onPress={() => editing ? setPickedId(group.id) : openGroup(group.id)}
      />)}
    </View>}

    <BottomSheet visible={creating} title="New group" onClose={() => setCreating(false)} footer={<Button title="Create group" onPress={createGroup} />}>
      <Text style={styles.label}>Group name</Text>
      <TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} placeholder="Friday dinner" placeholderTextColor={colors.muted} style={styles.input} maxLength={40} />
      <Text style={styles.label}>Friends</Text>
      {demo.friends.map((friend) => {
        const checked = selected.includes(friend.id);
        return <Pressable
          key={friend.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          onPress={() => setSelected((current) => checked ? current.filter((id) => id !== friend.id) : [...current, friend.id])}
          style={{
            minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12,
            paddingHorizontal: 12, borderRadius: 16, borderWidth: 2,
            backgroundColor: checked ? '#D3E6F4' : colors.paper,
            borderColor: checked ? colors.primary : colors.border,
          }}
        >
          <MemberAvatar person={friend} size={32} />
          <Text style={[styles.text, { flex: 1 }]}>{friend.name}</Text>
          <Text style={{ color: checked ? colors.primary : colors.muted, fontWeight: '700' }}>{checked ? 'Added' : 'Add'}</Text>
        </Pressable>;
      })}
      {createError && <ErrorBanner message={createError} />}
    </BottomSheet>

    <BottomSheet visible={friendsOpen} title="Friends" onClose={() => setFriendsOpen(false)}>
      <Text style={styles.small}>Add a friend by username or phone number.</Text>
      <TextInput
        accessibilityLabel="Friend username or phone number"
        autoCapitalize="none"
        autoCorrect={false}
        value={friendName}
        onChangeText={setFriendName}
        placeholder="@username or phone"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Button title="Add friend" compact onPress={addFriend} />
      {friendError && <ErrorBanner message={friendError} />}
      {friendMessage && <ErrorBanner tone="success" message={friendMessage} />}
      {demo.friends.map((friend) => <Pressable
        key={friend.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${friend.name}${friend.title ? `, ${friend.title}` : ''}`}
        onPress={() => { setFriendsOpen(false); router.push({ pathname: '/friend', params: { id: friend.id } }); }}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <MemberAvatar person={friend} />
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>
            <Text style={interFace(700)}>{friend.name}</Text>
            {friend.title ? `, ${friend.title}` : ''}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 22 }}>›</Text>
      </Pressable>)}
    </BottomSheet>
  </Screen>;
}

const yourTitle = {
  fontSize: 21, lineHeight: 26, color: colors.ink,
  ...Platform.select({
    web: { fontFamily: 'Inter', fontWeight: '400' as const, fontStyle: 'italic' as const },
    default: { fontFamily: interItalic, fontWeight: 'normal' as const, fontStyle: 'normal' as const },
  }),
};
const groupsHeading = { fontFamily: 'Inter', fontSize: 22, lineHeight: 28, fontWeight: '600' as const, color: colors.ink };
const dock = { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 };
const dockLabel = { fontFamily: 'Inter', color: colors.ink, fontWeight: '700' as const, fontSize: 15 };
