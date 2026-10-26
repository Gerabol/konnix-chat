import assert from 'node:assert'
import test, { describe } from 'node:test'
import type { Message, RoomFile } from '../api.ts'
import {
  extractRoomMedia,
  getMediaType,
  getNextMediaIndex,
  getPrevMediaIndex,
  isImageMime,
  isMediaAttachment,
  isVideoMime,
} from './mediaCarousel.ts'

describe('mediaCarousel utils', () => {
  describe('isImageMime & isVideoMime', () => {
    test('identifies images by mime and extension', () => {
      assert.strictEqual(isImageMime('image/png', 'foto.png'), true)
      assert.strictEqual(isImageMime('image/jpeg', 'foto.jpg'), true)
      assert.strictEqual(isImageMime('application/octet-stream', 'screenshot.webp'), true)
      assert.strictEqual(isImageMime('video/mp4', 'video.mp4'), false)
      assert.strictEqual(isImageMime('application/pdf', 'doc.pdf'), false)
    })

    test('identifies videos by mime and extension', () => {
      assert.strictEqual(isVideoMime('video/mp4', 'apresentacao.mp4'), true)
      assert.strictEqual(isVideoMime('video/webm', 'demo.webm'), true)
      assert.strictEqual(isVideoMime('application/octet-stream', 'filme.mov'), true)
      assert.strictEqual(isVideoMime('image/png', 'foto.png'), false)
      assert.strictEqual(isVideoMime('application/pdf', 'doc.pdf'), false)
    })

    test('isMediaAttachment returns true for images and videos, false for docs', () => {
      assert.strictEqual(isMediaAttachment({ mimeType: 'image/jpeg', originalName: 'foto.jpg' }), true)
      assert.strictEqual(isMediaAttachment({ mimeType: 'video/mp4', originalName: 'video.mp4' }), true)
      assert.strictEqual(isMediaAttachment({ mimeType: 'application/pdf', originalName: 'manual.pdf' }), false)
      assert.strictEqual(isMediaAttachment({ mimeType: 'audio/mpeg', originalName: 'audio.mp3' }), false)
    })

    test('getMediaType determines image or video', () => {
      assert.strictEqual(getMediaType('image/png', 'foto.png'), 'image')
      assert.strictEqual(getMediaType('video/mp4', 'demo.mp4'), 'video')
      assert.strictEqual(getMediaType('application/octet-stream', 'clip.webm'), 'video')
    })
  })

  describe('extractRoomMedia', () => {
    test('extracts, deduplicates and sorts media chronologically', () => {
      const roomFiles: RoomFile[] = [
        {
          id: 'file-2',
          originalName: 'video-tarde.mp4',
          mimeType: 'video/mp4',
          size: 2000000,
          createdAt: '2026-10-23T14:00:00Z',
          userId: 'u1',
          username: 'ana',
          name: 'Ana Silva',
        },
        {
          id: 'file-1',
          originalName: 'foto-manha.png',
          mimeType: 'image/png',
          size: 500000,
          createdAt: '2026-10-23T09:00:00Z',
          userId: 'u2',
          username: 'bruno',
          name: 'Bruno Lima',
        },
        {
          id: 'file-pdf',
          originalName: 'contrato.pdf',
          mimeType: 'application/pdf',
          size: 100000,
          createdAt: '2026-10-23T10:00:00Z',
          userId: 'u1',
          username: 'ana',
          name: 'Ana Silva',
        },
      ]

      const messages: Message[] = [
        {
          id: 'msg-3',
          roomId: 'r1',
          userId: 'u3',
          username: 'carlos',
          content: 'Nova foto recente',
          messageType: 'USER',
          parentMessageId: null,
          attachment: {
            id: 'file-3',
            originalName: 'foto-noite.jpg',
            mimeType: 'image/jpeg',
            size: 600000,
          },
          createdAt: '2026-10-23T19:00:00Z',
          updatedAt: '2026-10-23T19:00:00Z',
          editedAt: null,
          deletedAt: null,
          readBy: [],
          quotedMessage: null,
          reactions: [],
          forwardedFromUsername: null,
        },
        // Duplicate file-1 that was already in roomFiles
        {
          id: 'msg-1',
          roomId: 'r1',
          userId: 'u2',
          username: 'bruno',
          content: 'Foto manha repetida',
          messageType: 'USER',
          parentMessageId: null,
          attachment: {
            id: 'file-1',
            originalName: 'foto-manha.png',
            mimeType: 'image/png',
            size: 500000,
          },
          createdAt: '2026-10-23T09:00:00Z',
          updatedAt: '2026-10-23T09:00:00Z',
          editedAt: null,
          deletedAt: null,
          readBy: [],
          quotedMessage: null,
          reactions: [],
          forwardedFromUsername: null,
        },
      ]

      const result = extractRoomMedia(roomFiles, messages)

      // Should have 3 items: file-1, file-2, file-3 (pdf excluded, duplicate omitted)
      assert.strictEqual(result.length, 3)
      assert.strictEqual(result[0].id, 'file-1')
      assert.strictEqual(result[0].type, 'image')
      assert.strictEqual(result[1].id, 'file-2')
      assert.strictEqual(result[1].type, 'video')
      assert.strictEqual(result[2].id, 'file-3')
      assert.strictEqual(result[2].type, 'image')
    })

    test('excludes attachments from deleted messages both from messages and roomFiles', () => {
      const roomFiles: RoomFile[] = [
        {
          id: 'file-deleted',
          originalName: 'foto-antiga-deletada.png',
          mimeType: 'image/png',
          size: 120000,
          createdAt: '2026-10-23T08:00:00Z',
          userId: 'u1',
          username: 'ana',
          name: 'Ana Silva',
        },
        {
          id: 'file-active',
          originalName: 'foto-ativa.png',
          mimeType: 'image/png',
          size: 150000,
          createdAt: '2026-10-23T08:30:00Z',
          userId: 'u2',
          username: 'bruno',
          name: 'Bruno Lima',
        },
      ]

      const messages: Message[] = [
        {
          id: 'msg-deleted',
          roomId: 'r1',
          userId: 'u1',
          username: 'ana',
          content: 'Esta mensagem foi apagada.',
          messageType: 'USER',
          parentMessageId: null,
          attachment: {
            id: 'file-deleted',
            originalName: 'foto-antiga-deletada.png',
            mimeType: 'image/png',
            size: 120000,
          },
          createdAt: '2026-10-23T08:00:00Z',
          updatedAt: '2026-10-23T08:10:00Z',
          editedAt: null,
          deletedAt: '2026-10-23T08:10:00Z', // Deleted!
          readBy: [],
          quotedMessage: null,
          reactions: [],
          forwardedFromUsername: null,
        },
        {
          id: 'msg-timeline-deleted',
          roomId: 'r1',
          userId: 'u1',
          username: 'ana',
          content: 'Outra foto que foi apagada e só estava na timeline',
          messageType: 'USER',
          parentMessageId: null,
          attachment: {
            id: 'file-timeline-deleted',
            originalName: 'timeline-deletada.jpg',
            mimeType: 'image/jpeg',
            size: 80000,
          },
          createdAt: '2026-10-23T08:40:00Z',
          updatedAt: '2026-10-23T08:45:00Z',
          editedAt: null,
          deletedAt: '2026-10-23T08:45:00Z', // Deleted!
          readBy: [],
          quotedMessage: null,
          reactions: [],
          forwardedFromUsername: null,
        },
      ]

      const result = extractRoomMedia(roomFiles, messages)

      // Only file-active should remain; both file-deleted and file-timeline-deleted must be excluded
      assert.strictEqual(result.length, 1)
      assert.strictEqual(result[0].id, 'file-active')
    })
  })

  describe('navigation index boundaries', () => {
    test('getNextMediaIndex increments within range and stops at end', () => {
      assert.strictEqual(getNextMediaIndex(0, 3), 1)
      assert.strictEqual(getNextMediaIndex(1, 3), 2)
      assert.strictEqual(getNextMediaIndex(2, 3), 2) // already at last index
      assert.strictEqual(getNextMediaIndex(0, 0), 0)
    })

    test('getPrevMediaIndex decrements within range and stops at start', () => {
      assert.strictEqual(getPrevMediaIndex(2), 1)
      assert.strictEqual(getPrevMediaIndex(1), 0)
      assert.strictEqual(getPrevMediaIndex(0), 0) // already at first index
    })
  })
})
