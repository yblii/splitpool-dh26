import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MemberAvatar } from '../components/people';
import { AppHeader, Card, EmptyState, Screen, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function FriendScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const demo = useDemo();
  const friend = demo.friends.find((person) => person.id === id) ?? (id ? demo.lookup(id) : null);
  const known = !!id && demo.friends.some((person) => person.id === id);
  const groups = demo.groups.filter((group) => id && group.memberIds.includes(id));

  return <Screen header={<AppHeader title="Friend" onBack={() => router.back()} />}>
    {!friend || !known ? <EmptyState title="Friend not found" body="Add them from Groups with a demo username or phone number." /> : <>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 8 }}>
        <MemberAvatar person={friend} size={84} />
        <Text style={styles.title}>{friend.name}</Text>
        <Text style={styles.subtitle}>@{friend.username}{friend.phone ? ` · ${friend.phone}` : ''}</Text>
      </View>
      <Card>
        <Text style={styles.heading}>Groups together</Text>
        {groups.length === 0 ? <Text style={styles.small}>You are not in a group with {friend.name} yet.</Text> : groups.map((group) => <Text key={group.id} style={styles.text}>{group.name}</Text>)}
        <Text style={styles.small}>This profile is sample data on your device. It is not a signed-in account.</Text>
      </Card>
    </>}
  </Screen>;
}
