# Debugging Payment Status Issue

## Problem
User submitted payment with transaction reference, but no pending request appears in super admin dashboard.

## Debug Steps

### 1. Check Browser Console
When user submits payment, look for these logs:
```
💳 Setting payment status to 'paid' for user [USER_UID]:
  previousStatus: [old status]
  newStatus: paid
  transactionRef: [transaction ID]

✅ Payment status updated successfully for user: [USER_UID]
```

### 2. Check Admin Dashboard Console
When admin loads the approval page, look for:
```
🔍 Fetching users with payment status: paid
✅ Found X users with status 'paid'
```

### 3. Manual Firestore Check
1. Go to [Firestore Console](https://console.firebase.google.com/project/watch-mail-trial/firestore/data)
2. Navigate to `users` collection
3. Click on the test user's document
4. Check the `paymentStatus` object:
   ```json
   {
     "status": "paid",
     "amount": 999,
     "transactionRef": "...",
     "paidAt": [timestamp],
     ...
   }
   ```

### 4. Test Query in Console
In the Firebase Console, run this query on the `users` collection:
- Field: `paymentStatus.status`
- Operator: `==`
- Value: `paid`

If it fails with **"The query requires an index"** error:
- Click the link provided to create the index
- Wait 2-3 minutes for index to build
- Retry the query

### 5. Firestore Composite Index Required?
If getting index error, you need to create a composite index:
- Collection: `users`
- Fields: `paymentStatus.status` (Ascending)

## Expected Data Flow

```
User Payment → updatePaymentStatus('paid') 
  ↓
Firestore: users/{uid}.paymentStatus.status = 'paid'
  ↓
Admin loads dashboard → getUsersByPaymentStatus('paid')
  ↓
Query: where('paymentStatus.status', '==', 'paid')
  ↓
Results shown in approval table
```

## Common Issues & Solutions

| Issue | Solution |
|-------|----------|
| No users appear in "Awaiting Verification" tab | Check browser console for query error. May need Firestore index. |
| Query error: "requires an index" | Create composite index via Firebase Console link |
| Payment submitted but status didn't change | Check if Firestore write succeeded (look for ✅ log) |
| Admin can't approve payments | Verify admin account has `role: 'super_admin'` |

## Quick Fix Checklist

- [ ] Check browser console for errors during payment submission
- [ ] Check admin dashboard console when loading users
- [ ] Verify user document has `paymentStatus.status: 'paid'` in Firestore Console
- [ ] Check if index error appears - create index if needed
- [ ] Refresh admin dashboard after index is created
- [ ] Verify admin account is super_admin role
