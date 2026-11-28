import {expect,it} from 'vitest';
import {deletableBubbleTurn} from './BubbleContextMenu';
it('offers deletion after streamed canonical reply finishes, while keeping active and unidentified bubbles protected',()=>{
 expect(deletableBubbleTurn({turnId:'turn_fixture',isStreaming:true,streamingDone:true})).toBe('turn_fixture');
 expect(deletableBubbleTurn({turnId:'turn_fixture',isStreaming:true,streamingDone:false})).toBeUndefined();
 expect(deletableBubbleTurn({streamingDone:true})).toBeUndefined();
 expect(deletableBubbleTurn({turnId:'turn_fixture'})).toBe('turn_fixture');
 expect(deletableBubbleTurn({replyIdentity:{turn_id:'receipt_turn'}})).toBe('receipt_turn');
});
