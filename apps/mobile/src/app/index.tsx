import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { GroupCard } from '../components/groups';
import { MemberAvatar } from '../components/people';
import { BottomSheet } from '../components/sheets';
import { AppHeader, Button, Card, ErrorBanner, Screen, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function GroupsScreen() {
  const demo = useDemo();
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friendName, setFriendName] = useState('');
  const [friendMessage, setFriendMessage] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);

  function openGroup(id: string) {
    demo.selectGroup(id);
    router.push({ pathname: '/group', params: { id } });
  }

  function startBill(groupId: string) {
    demo.selectGroup(groupId);
    demo.selectReceiptGroup(groupId);
    setStarting(false);
    router.push('/receipt');
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
    setFriendMessage(`${result.person.name} was added. This is a local demo, so no invite was sent.`);
  }

  return <Screen header={<AppHeader title="Groups" right={<Pressable accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={8} onPress={() => router.push('/profile')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
    <Text style={styles.link}>Profile</Text>
  </Pressable>} />}>
    <View style={{ gap: 6 }}>
      <Text style={styles.title}>Groups</Text>
      <Text style={styles.subtitle}>Pick a group, then split a receipt together.</Text>
    </View>
    <Button title="Start a new bill" onPress={() => setStarting(true)} />
    <Button title="New group" secondary onPress={() => { setCreateError(null); setCreating(true); }} />
    <View style={{ gap: 12 }}>
      {demo.groups.map((group) => {
        const members = group.memberIds.map((id) => demo.lookup(id));
        return <GroupCard
          key={group.id}
          name={group.name}
          members={members}
          meta={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}
          detail={demo.activityLabel(group.id)}
          onPress={() => openGroup(group.id)}
        />;
      })}
    </View>
    <Card>
      <Text style={styles.heading}>Friends</Text>
      <Text style={styles.small}>Add a demo friend by username. Try @riley or @morgan.</Text>
      <TextInput
        accessibilityLabel="Friend username"
        autoCapitalize="none"
        autoCorrect={false}
        value={friendName}
        onChangeText={setFriendName}
        placeholder="@username"
        placeholderTextColor="#5C6E7E"
        style={styles.input}
      />
      <Button title="Add friend" compact onPress={addFriend} />
      {friendError && <ErrorBanner message={friendError} />}
      {friendMessage && <ErrorBanner tone="success" message={friendMessage} />}
      <View style={{ gap: 8 }}>
        {demo.friends.map((friend) => <Pressable
          key={friend.id}
          accessibilityRole="button"
          accessibilityLabel={`Open ${friend.name}'s profile`}
          onPress={() => router.push({ pathname: '/friend', params: { id: friend.id } })}
          style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}
        >
          <MemberAvatar person={friend} />
          <View style={{ flex: 1 }}>
            <Text style={styles.text}>{friend.name}</Text>
            <Text style={styles.small}>@{friend.username}</Text>
          </View>
          <Text style={{ color: '#5C6E7E', fontSize: 22 }}>›</Text>
        </Pressable>)}
      </View>
    </Card>

    <BottomSheet visible={creating} title="New group" onClose={() => setCreating(false)} footer={<Button title="Create group" onPress={createGroup} />}>
      <Text style={styles.small}>The group stays on this device. Nothing is invited for real.</Text>
      <Text style={styles.label}>Group name</Text>
      <TextInput accessibilityLabel="Group name" value={groupName} onChangeText={setGroupName} placeholder="Friday dinner" placeholderTextColor="#5C6E7E" style={styles.input} maxLength={40} />
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
          <Text style={{ color: checked ? '#1F4E72' : '#5C6E7E', fontWeight: '700' }}>{checked ? 'Added' : 'Add'}</Text>
        </Pressable>;
      })}
      {createError && <ErrorBanner message={createError} />}
    </BottomSheet>

    <BottomSheet visible={starting} title="Which group?" onClose={() => setStarting(false)}>
      <Text style={styles.small}>The receipt is attached to one group.</Text>
      {demo.groups.map((group) => <Button key={group.id} title={group.name} secondary onPress={() => startBill(group.id)} />)}
    </BottomSheet>
  </Screen>;
}
