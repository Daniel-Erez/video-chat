import React, { useRef, useState } from 'react';
import io from 'socket.io-client';
import { Peer } from "peerjs";
import useArray from "./useArray"
import useUpdateEffect from './useUpdateEffect';
import useEffectOnce from './useEffectOnce'
import mute from './assets/speaker off.js'
import unMute from './assets/speaker.js'
import openMic from './assets/mic.js'
import closeMic from './assets/mic off.js'


export default function Room() {
    const socket = useRef(io("http://10.0.0.140:8000/"))
    const myPeer = useRef(new Peer())
    const vidRef = useRef([]);
    const { array: videos, push: pushVid, update: updateVid, set: setVid } = useArray([{ id: 0 }])
    const peers = useRef({})
    const myStream = useRef()
    const [AmIMute, setAmIMute]=useState(false)

    useUpdateEffect(() => {//keep video refs updated
        videos.forEach((vid, i) => {
            const vidEl = vidRef.current[i].firstElementChild
            vidEl.muted = vid.muted
            vidEl.srcObject = vid?.stream
        })
    }, [videos])

    useEffectOnce(() => {//set my stream
        navigator.mediaDevices.getUserMedia({ //get my stream
            video: true,
            audio: true
        }).then(stream => {
            const myVid = { id: 0, muted: true, stream }
            videos.length ? updateVid(0, myVid) : pushVid(myVid)
            myStream.current = stream
        })
            .catch(() => {
                navigator.mediaDevices.getUserMedia({ //get my stream
                    video: false,
                    audio: true
                }).then(stream => {
                    const myVid = { id: 0, muted: true, stream }
                    videos.length ? updateVid(0, myVid) : pushVid(myVid)
                    myStream.current = stream
                }).catch(() => {
                    const stream = null
                    const myVid = { id: 0, muted: true, stream }
                    videos.length ? updateVid(0, myVid) : pushVid(myVid)
                    myStream.current = stream
                    setAmIMute(true)
                })
            })
    })

    useEffectOnce(() => {//set peerjs events
        myPeer.current.on('call', (call) => { //when existing peer call me
            call.answer(myStream.current) //return my stram to his call
            const peerVid = { id: call.peer, muted: false }
            call.on('stream', userVideoStream => { //get his stream from the call
                peerVid.stream = userVideoStream
                setVid(vids => { //add peer vid to my screen
                    if (vids.some((vid) => vid.id === call.peer)) return vids
                    return [...vids, peerVid]
                })
            })
            call.on('close', () => { //when the call ended
                setVid(vids => vids.filter((vid) => vid.id !== peerVid.id))
            })
            peers.current[call.peer] = call
        })
        myPeer.current.on('open', id => {
            console.log("I'm-connected: " + id)
            socket.current.emit('user-joined', id)
        });

        return () => {
            myPeer.current.off("call")
            myPeer.current.off("open")
        }
    })

    useEffectOnce(() => {//set socket-io events
        socket.current.on('user-connected', userId => { //when new peer connect
            console.log("user-connected: " + userId)
            connectToNewUser(userId) //call the new peer with my stream
        })
        socket.current.on('user-disconnected', userId => {
            console.log("user-disconnected: " + userId)
            peers.current[userId]?.close()
        })

        function connectToNewUser(userId) {
            const call = myPeer.current.call(userId, myStream.current) //call the new peer with my stream
            const vid = { id: userId, muted: false }
            call.on('stream', userVideoStream => { //when the new peer return his steam to my call
                vid.stream = userVideoStream
                setVid(vids => {
                    if (vids.some((vid) => vid.id === userId)) return vids
                    return [...vids, vid]
                })
            })
            call.on('close', () => { //when the call ended
                setVid(vids => vids.filter((vid) => vid.id !== userId))
            })

            peers.current[userId] = call
        }

        return () => {
            socket.current.off("user-connected")
            socket.current.off("user-disconnected")
        }
    })

    function toggleMute(e) {
        const idx = e.target.parentElement.id;
        if (idx === 0) return;
        setVid((vids) => {
            const newVids = [...vids];
            newVids[idx].muted = !newVids[idx].muted
            return newVids
        })
    }

    function toggleSpeaker() {
        myStream.current.getAudioTracks()[0].enabled=!myStream.current.getAudioTracks()[0].enabled
        setAmIMute(!myStream.current.getAudioTracks()[0].enabled)
    }

    return (<>
        <div id="video-grid">
            {videos.map((vid, i) => {
                return (<div key={vid.id} ref={el => vidRef.current[i] = el} className="container">
                    <video onLoadedMetadata={(e) => e.target.play()}></video>
                    <div id={i} className="controls">
                        {i === 0 &&
                            <div onClick={()=>toggleSpeaker()}>
                                {AmIMute ? closeMic : openMic}
                            </div>}
                        {i !== 0 &&
                            <div onClick={(e) => toggleMute(e)}>
                                {vid.muted ? mute : unMute}
                            </div>}
                    </div>
                </div>)
            })}
        </div>
    </>
    )
}
