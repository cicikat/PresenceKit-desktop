import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('./authGate',()=>({captureRealitySession:vi.fn(),invokeGated:vi.fn(),isRealitySessionCurrent:vi.fn()}));
import {captureRealitySession,invokeGated,isRealitySessionCurrent} from './authGate';
import {conversationRequest,visibleConversationMessages,selectExecutionToStop} from './conversation';
beforeEach(()=>{vi.mocked(captureRealitySession).mockResolvedValue({grant:{session_id:'session_fixture',char_id:'character_fixture',owner_id:'owner_fixture',domain:'reality',expires_at:9999999999,connection_key:'connection_fixture'},generation:1});vi.mocked(isRealitySessionCurrent).mockResolvedValue(true);vi.mocked(invokeGated).mockResolvedValue({state:'stopped'});});
it('sends a scoped server stop instead of a local abort',async()=>{
 expect(await conversationRequest('stop','execution_fixture')).toEqual({state:'stopped'});
 expect(invokeGated).toHaveBeenCalledWith('conversation_request',{action:'stop',identifier:'execution_fixture',body:{}},expect.objectContaining({generation:1}));
});
it('rejects a successful but stale response after changing role or connection',async()=>{
 vi.mocked(isRealitySessionCurrent).mockResolvedValue(false);
 await expect(conversationRequest('delete','turn_fixture',{operation_id:'operation_fixture'})).rejects.toThrow('session_scope_stale');
});
it('late history and WS cannot resurrect a withdrawn canonical turn or retired stream',()=>{
 const rows=[{id:'a',turnId:'deleted'},{id:'b',turnId:'kept'},{id:'c',wsMsgId:'stream_deleted'},{id:'withdrawn_request'}];
 expect(visibleConversationMessages(rows,new Set(['deleted']),new Set(['stream_deleted','withdrawn_request']))).toEqual([rows[1]]);
 expect(visibleConversationMessages(rows,new Set(),new Set())).toEqual(rows);
});

it('one stop targets the running request and leaves later queued inputs alone',()=>{
 const queued={execution_id:'later',request_id:'queued_fixture',state:'queued',turn_id:''};
 const running={execution_id:'current',request_id:'running_fixture',state:'running',turn_id:''};
 expect(selectExecutionToStop([queued,running])).toBe(running);
 expect(selectExecutionToStop([{...running,state:'committing'}])).toBeUndefined();
});
