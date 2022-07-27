import { DateTime } from 'luxon';
import { createMemo, createResource, onCleanup } from 'solid-js';

const PREFIX = globalThis?.location?.origin ?? `http://localhost`;

class FetchError extends Error {
  statusCode: number;
  constructor(msg: string, options: ErrorOptions | undefined, statusCode: number) {
    super(msg, options);
    this.statusCode = statusCode;
  }
}

async function fetcher(url: URL | string): Promise<Object | Object[]> {
  const res = await fetch(url.toString(), {
    credentials: 'same-origin',
    headers: [
      ['Content-Type', 'application/json']
    ],
    // ...options
  });

  if (!res.ok) {
    const msg = (await res.json()).message || "No error message available.";
    // If unauthorized this cookie is no good, so we remove it
    const error = new FetchError(msg, undefined, res.status);
    throw error;
  }

  return await res.json();
}

export function useApi(func: Function) {

  const results = createResource(() => {
    const url = new URL(func(), PREFIX);
    if (process.env.NODE_ENV === 'development')
      url.port = '8000';
    return url;
  }, fetcher);
  return results;
}

export function useEvents() {
  const url = new URL('/events', PREFIX);
  if (process.env.NODE_ENV === 'development')
    url.port = '8000';
  const sse = new EventSource(url);
  onCleanup(() => {
    sse.close();
  });
  return sse;
}

interface GetMessagesOptions {
  startTime?: DateTime,
  endTime?: DateTime,
  lastEndTime?: DateTime,
  msg?: String,
  severity?: String,
  hostname?: String,
  ipAddress?: String
}
export function getMessagesQuery({ startTime = DateTime.now().minus({ minutes: 15 }), endTime = DateTime.now(), msg = '', severity = '', hostname = '', ipAddress, lastEndTime }: GetMessagesOptions) {

    // These are split because you cannot have a OPTIONAL MATCH after a MATCH 
    const manditory: { [k: string]: string } = {}
    const optional: { [k: string]: string } = {};
    manditory['node'] = msg ?
      `CALL db.idx.fulltext.queryNodes('Message','${msg}') YIELD node` :
      `MATCH (node:Message)`;
    if (startTime || endTime) {
      manditory['node'] += ' WHERE';
    }
    if (lastEndTime || startTime) {
      if (lastEndTime) console.log('using last end time')
      if (startTime) console.log('using start time')
      manditory['node'] += ` node.server_timestamp>=${(lastEndTime || startTime).toMillis()}`;
    }
    if ((lastEndTime || startTime) && endTime) {
      manditory['node'] += ` AND`;
    }
    if (endTime) {
      manditory['node'] += ` node.server_timestamp<=${endTime.toMillis()}`;
    }
    severity?.length ?
      manditory['severity'] = `MATCH (node)-->(severity:Severity) WHERE severity.name CONTAINS '${severity}'` :
      optional['severity'] = `OPTIONAL MATCH (node)-->(severity:Severity)`;
    hostname?.length ?
      manditory['hostname'] = `MATCH (node)-->(hostname:Hostname) WHERE hostname.name CONTAINS '${hostname}'` :
      optional['hostname'] = `OPTIONAL MATCH (node)-->(hostname:Hostname)`;
    if (ipAddress !== undefined) ipAddress?.length ?
      manditory['address'] = `MATCH (node)-->(address:Address) WHERE address.ip CONTAINS '${ipAddress}'` :
      optional['address'] = `OPTIONAL MATCH (node)-->(address:Address)`;


  const statements = { ...manditory, ...optional }
  
  // console.debug(Object.values(statements).join(' '));
  return `
  ${Object.values(statements).join(' ')}
  RETURN DISTINCT ${Object.keys(statements).join(',')},ID(node) as id
  ORDER BY node.server_timestamp ASC
  LIMIT 1000
  `;
}