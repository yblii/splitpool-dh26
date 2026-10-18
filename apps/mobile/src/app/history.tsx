import { Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { formatMoney } from '@splitpool/contracts';
import { monoFamily } from '../fonts';
import { AppHeader, Card, EmptyState, Screen, colors, moneyMark, styles } from '../components/ui';
import { useDemo } from '../state/demo';

export default function HistoryScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const demo = useDemo();
  const bill = demo.pastBills.find((entry) => entry.id === id);
  const group = bill ? demo.groups.find((entry) => entry.id === bill.groupId) : null;

  return <Screen header={<AppHeader title="Bill" onBack={() => router.back()} />}>
    {!bill ? <EmptyState title="Bill not found" body="That sample bill is no longer in this demo." /> : <>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>{bill.merchant}</Text>
        <Text style={styles.subtitle}>{group?.name ?? 'Group'} · {bill.dateLabel}</Text>
      </View>
      <Card>
        <View style={styles.row}><Text style={styles.text}>Group total</Text><Text {...moneyMark} style={[styles.heading, { fontFamily: monoFamily }]}>{formatMoney(bill.totalCents)}</Text></View>
        <View style={styles.row}><Text style={styles.text}>You paid</Text><Text {...moneyMark} style={[styles.heading, { fontFamily: monoFamily }]}>{formatMoney(bill.yourShareCents)}</Text></View>
        <Text style={{ color: colors.success, fontWeight: '700' }}>Paid</Text>
        <Text style={styles.small}>This is sample history. It cannot be edited, and it was not a real charge.</Text>
      </Card>
    </>}
  </Screen>;
}
