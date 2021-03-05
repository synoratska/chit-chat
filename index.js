const functions = require('firebase-functions');
const app = require('express')()
const FBAuth = require('./util/fbAuth')

const { db } = require('./util/admin')

const {
    getAllGossips,
    postOneGossip,
    getGossip,
    commentOnGossip,
    likeGossip,
    unlikeGossip,
    deleteGossip
} = require('./handlers/gossips')

const {
    signup,
    login,
    uploadImage,
    addUserDetails,
    getAuthenticatedUser,
    getUserDetails,
    markNotificationsRead
} = require('./handlers/users')

// Gossips routes
app.get('/gossips', getAllGossips)
app.post('/gossip', FBAuth, postOneGossip)
app.get('/gossip/:gossipId', getGossip)
// TODO delete gossip
app.delete('/gossip/:gossipId', FBAuth, deleteGossip)
// TODO like a gossip
app.get('/gossip/:gossipId/like', FBAuth, likeGossip)
// TODO unlike a gossip
app.get('/gossip/:gossipId/unlike', FBAuth, unlikeGossip)
// TODO comment on gossip
app.post('/gossip/:gossipId/comment', FBAuth, commentOnGossip)

// Users route
app.post('/signup', signup)
app.post('/login', login)
app.post('/user/image', FBAuth, uploadImage)
app.post('/user', FBAuth, addUserDetails)
app.get('/user', FBAuth, getAuthenticatedUser)
app.get('/user/:handle', getUserDetails)
app.post('/notifications', FBAuth, markNotificationsRead)

exports.api = functions.region('europe-west1').https.onRequest(app)

exports.createNotificationOnLike = functions
    .region('europe-west1')
    .firestore.document('likes/{id}')
    .onCreate((snapshot) => {
        return db
            .doc(`/gossips/${snapshot.data().gossipId}`)
            .get()
            .then((doc) => {
                if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`)
                        .set({
                            createdAt: new Date().toISOString(),
                            recipient: doc.data().userHandle,
                            sender: snapshot.data().userHandle,
                            type: 'like',
                            read: false,
                            gossipId: doc.id
                        })
                }
            })
            .catch((err) =>
                console.error(err))
    })

exports.deleteNotificationOnUnlike = functions
    .region('europe-west1')
    .firestore.document('likes/{id}')
    .onDelete((snapshot) => {
        return db
            .doc(`/notifications/${snapshot.id}`)
            .delete()
            .catch((err) => {
                console.error(err)
            })
    })

exports.createNotificationOnComment = functions
    .region('europe-west1')
    .firestore.document('comments/{id}')
    .onCreate((snapshot) => {
        return db
            .doc(`/gossips/${snapshot.data().gossipId}`)
            .get()
            .then((doc) => {
                if(doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db
                        .doc(`/notifications/${snapshot.id}`)
                        .set({
                            createdAt: new Date().toISOString(),
                            recipient: doc.data().userHandle,
                            sender: snapshot.data().userHandle,
                            type: 'comment',
                            read: false,
                            gossipId: doc.id
                        })
                }
            })
            .catch((err) => {
                console.error(err)
            })
    })

exports.onUserImageChange = functions
    .region('europe-west1')
    .firestore.document('/users/{userId}') 
    .onUpdate((change) => {
        console.log(change.before.data())
        console.log(change.after.data())
        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
            console.log('image has changed')
            const batch = db.batch();
            return db
                .collection('gossips')
                .where('userHandle', '==', change.before.data().handle)
                .get()
                .then((data) => {
                    data.forEach((doc) => {
                        const gossip = db.doc(`/gossips/${doc.id}`)
                        batch.update(gossip, { userImage: change.after.data().imageUrl })
                    })
                    return batch.commit()
                })
        } else return true
    })

exports.onGossipDelete = functions
    .region('europe-west1')
    .firestore.document('/gossips/{gossipId}')
    .onDelete((snapshot, context) => {
        const gossipId = context.params.gossipId
        const batch = db.batch()
        return db
            .collection('comments')
            .where('gossipId', '==', gossipId)
            .get()
            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/comments/${doc.id}`))
                })
                return db.collection('likes').where('gossipId', '==', gossipId)
                    .get()
            })

            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/likes/${doc.id}`))
                })
                return db.collection('notifications').where('gossipId', '==', gossipId)
                    .get()
            })

            .then((data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/notifications/${doc.id}`))
                })
                return batch.commit()
            })
            .catch((err) =>
                console.error(err))
    })