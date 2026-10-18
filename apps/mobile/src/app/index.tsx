import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { GroupCard } from '../components/groups';
import { AvatarStack, MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { AppHeader, Button, ErrorBanner, Screen, colors, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function GroupsScreen() {
  const demo = useDemo();
  const [creating, setCreating] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friendName, setFriendName] = useState('');
  const [friendMessage, setFriendMessage] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>(['fam']);
  const [hidden, setHidden] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);

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
    setFriendMessage(`${result.person.name} was added. This stays on this device.`);
  }

  const visible = demo.groups.filter((group) => !hidden.includes(group.id));
  const hiddenGroups = demo.groups.filter((group) => hidden.includes(group.id));
  const ordered = [...visible].sort((a, b) => Number(pinned.includes(b.id)) - Number(pinned.includes(a.id)));

  return <Screen
    header={<AppHeader title="Groups" right={<Pressable accessibilityRole="button" accessibilityLabel="New group" hitSlop={8} onPress={() => { setCreateError(null); setCreating(true); }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
      <Text style={styles.link}>+ New</Text>
    </Pressable>} />}
    footer={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Open your profile" onPress={() => router.push('/profile')} style={dock}>
        <MemberAvatar person={demo.you} size={36} />
        <Text style={dockLabel}>Profile</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Open friends" onPress={() => { setFriendError(null); setFriendsOpen(true); }} style={dock}>
        <AvatarStack people={demo.friends} size={28} />
        <Text style={dockLabel}>Friends</Text>
      </Pressable>
    </View>}
  >
    <Text style={styles.title}>Groups</Text>
    <View style={{ gap: 18 }}>
      {ordered.map((group) => <GroupCard
        key={group.id}
        name={group.name}
        members={group.memberIds.map((id) => demo.lookup(id))}
        pinned={pinned.includes(group.id)}
        onPress={() => openGroup(group.id)}
        onPin={() => setPinned((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [group.id, ...current])}
        onHide={() => setHidden((current) => current.includes(group.id) ? current : [...current, group.id])}
      />)}
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: showHidden }} onPress={() => setShowHidden((current) => !current)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={styles.text}>{showHidden ? '⌄' : '›'} Hidden</Text>
    </Pressable>
    {showHidden && hiddenGroups.length === 0 && <Text style={styles.small}>Hidden groups show up here.</Text>}
    {showHidden && <View style={{ gap: 18 }}>
      {hiddenGroups.map((group) => <GroupCard
        key={group.id}
        name={group.name}
        members={group.memberIds.map((id) => demo.lookup(id))}
        onPress={() => openGroup(group.id)}
        hideLabel="Show"
        onPin={() => {
          setHidden((current) => current.filter((id) => id !== group.id));
          setPinned((current) => current.includes(group.id) ? current : [group.id, ...current]);
        }}
        onHide={() => setHidden((current) => current.filter((id) => id !== group.id))}
      />)}
    </View>}

    <BottomSheet visible={creating} title="New group" onClose={() => setCreating(false)} footer={<Button title="Create group" onPress={createGroup} />}>
      <Text style={styles.small}>The group stays on this device.</Text>
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
          style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <MemberAvatar person={friend} size={32} />
          <Text style={[styles.text, { flex: 1 }]}>{friend.name}</Text>
          <Text style={{ color: checked ? colors.primary : colors.muted, fontWeight: '700' }}>{checked ? 'Added' : 'Add'}</Text>
        </Pressable>;
      })}
      {createError && <ErrorBanner message={createError} />}
    </BottomSheet>

    <BottomSheet visible={friendsOpen} title="Friends" onClose={() => setFriendsOpen(false)}>
      <Text style={styles.small}>Add a demo friend by username. Try @riley or @morgan.</Text>
      <TextInput
        accessibilityLabel="Friend username"
        autoCapitalize="none"
        autoCorrect={false}
        value={friendName}
        onChangeText={setFriendName}
        placeholder="@username"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      <Button title="Add friend" compact onPress={addFriend} />
      {friendError && <ErrorBanner message={friendError} />}
      {friendMessage && <ErrorBanner tone="success" message={friendMessage} />}
      {demo.friends.map((friend) => <Pressable
        key={friend.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${friend.name}'s profile`}
        onPress={() => { setFriendsOpen(false); router.push({ pathname: '/friend', params: { id: friend.id } }); }}
        style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <MemberAvatar person={friend} />
        <View style={{ flex: 1 }}>
          <Text style={styles.text}>{friend.name}</Text>
          <Text style={styles.small}>@{friend.username}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 22 }}>›</Text>
      </Pressable>)}
    </BottomSheet>
  </Screen>;
}

const dock = { minHeight: 48, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 };
const dockLabel = { color: colors.ink, fontWeight: '700' as const, fontSize: 15 };
