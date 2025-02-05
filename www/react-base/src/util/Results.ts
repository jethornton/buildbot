/*
  This file is part of Buildbot.  Buildbot is free software: you can
  redistribute it and/or modify it under the terms of the GNU General Public
  License as published by the Free Software Foundation, version 2.

  This program is distributed in the hope that it will be useful, but WITHOUT
  ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
  FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more
  details.

  You should have received a copy of the GNU General Public License along with
  this program; if not, write to the Free Software Foundation, Inc., 51
  Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

  Copyright Buildbot Team Members
*/

import {Step} from "../data/classes/Step";
import {Build} from "../data/classes/Build";
import {Buildrequest} from "../data/classes/Buildrequest";

export const SUCCESS = 0;
export const WARNINGS = 1;
export const FAILURE = 2;
export const SKIPPED = 3;
export const EXCEPTION = 4;
export const RETRY = 5;
export const CANCELLED = 6;

const resultToInt = {
  SUCCESS: SUCCESS,
  WARNINGS: WARNINGS,
  FAILURE: FAILURE,
  SKIPPED: SKIPPED,
  EXCEPTION: EXCEPTION,
  RETRY: RETRY,
  CANCELLED: CANCELLED,
};

const intToResult: {[key: number]: string} = {
  [SUCCESS]: "SUCCESS",
  [WARNINGS]: "WARNINGS",
  [FAILURE]: "FAILURE",
  [SKIPPED]: "SKIPPED",
  [EXCEPTION]: "EXCEPTION",
  [RETRY]: "RETRY",
  [CANCELLED]: "CANCELLED",
};

export function results2class(buildOrStep: Build | Step, pulse: string | null) {
  let ret = "results_UNKNOWN";
  if (buildOrStep !== null) {
    if ((buildOrStep.results !== null) && buildOrStep.results in intToResult) {
      ret = `results_${intToResult[buildOrStep.results]}`;
    }
    if ((buildOrStep.complete === false)  && ((buildOrStep.started_at ?? 0) > 0)) {
      ret = 'results_PENDING';
      if (pulse != null) {
        ret += ` ${pulse}`;
      }
    }
  }
  return ret;
}

export function results2text(objWithResults: Build | Step | Buildrequest) {
  let ret = "...";
  if (objWithResults !== null) {
    if ((objWithResults.results !== null) && objWithResults.results in intToResult) {
      ret = intToResult[objWithResults.results];
    }
  }
  return ret;
}
