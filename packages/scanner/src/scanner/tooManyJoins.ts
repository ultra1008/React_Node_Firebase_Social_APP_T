import { Event } from '@appland/models';
import { MatchResult } from '../types';
import Assertion from '../assertion';
import { JoinCount, countJoins, sqlStrings } from '../database';

class Options {
  constructor(public warningLimit = 5, public whitelist: string[] = []) {}
}

function scanner(options: Options = new Options()): Assertion {
  const joinCount: Record<string, JoinCount> = {};

  const matcher = (command: Event): MatchResult[] | undefined => {
    for (const sqlEvent of sqlStrings(command)) {
      let occurrance = joinCount[sqlEvent.sql];

      if (!occurrance) {
        occurrance = {
          count: 1,
          joins: countJoins(sqlEvent.sql),
          events: [sqlEvent.event],
        };
        joinCount[sqlEvent.sql] = occurrance;
      } else {
        occurrance.count += 1;
        occurrance.events.push(sqlEvent.event);
      }
    }

    return Object.keys(joinCount).reduce((matchResults, sql) => {
      const occurrance = joinCount[sql];

      if (occurrance.joins >= options.warningLimit) {
        matchResults.push({
          level: 'warning',
          event: occurrance.events[0],
          message: `${occurrance.joins} join${occurrance.joins > 1 ? 's' : ''} in SQL "${sql}"`,
          relatedEvents: occurrance.events,
        });
      }
      return matchResults;
    }, [] as MatchResult[]);
  };

  return Assertion.assert(
    'too-many-joins',
    'Too many joins',
    matcher,
    (assertion: Assertion): void => {
      assertion.description = `SQL query has too many joins ${assertion.options}`;
    }
  );
}

export default { scope: 'command', enumerateScope: false, Options, scanner };
