/*external modules*/
import _ from 'lodash';
import { LanguageServiceClient } from '@google-cloud/language';
import { google } from '@google-cloud/language/build/protos/protos';
/*DB*/
import { UserMood } from '../../db/types/moodMeter';
/*models*/
/*GQL*/
/*other*/
import { config } from '../../config';

export namespace GoogleNLService {
  export const client = new LanguageServiceClient({
    credentials: {
      client_email: config.secrets.googleNLClientEmail,
      private_key: config.secrets.googleNLPrivateKey
    }
  });

  export import TEntityType = google.cloud.language.v1.Entity.Type; // eslint-disable-line
  export import TDocumentType = google.cloud.language.v1.Document.Type; // eslint-disable-line

  export const MoodMatchingTable: Array<[number, number, UserMood]> = [
    [-0.2, -0.25, UserMood.Bored],
    [-0.15, -0.2, UserMood.Tired],
    [-0.1, -0.15, UserMood.Fatigued],
    [-0.05, -0.1, UserMood.Calm],
    [-0.05, 0.05, UserMood.Mellow],
    [0.05, 0.1, UserMood.Apathetic],
    [0.1, 0.15, UserMood.AtEase],
    [0.15, 0.2, UserMood.Relaxed],
    [0.2, 0.25, UserMood.Sleepy],

    [-0.25, -0.33, UserMood.Peeved],
    [-0.33, -0.41, UserMood.Annoyed],
    [-0.41, -0.49, UserMood.Sad],
    [-0.49, -0.57, UserMood.Irritated],
    [-0.57, -0.65, UserMood.Angry],
    [-0.65, -0.73, UserMood.Stressed],
    [-0.73, -0.81, UserMood.Anxious],
    [-0.81, -0.89, UserMood.Furious],
    [-0.89, -1, UserMood.Enraged],
    [0.25, 0.33, UserMood.Pleased],
    [0.33, 0.41, UserMood.Content],
    [0.41, 0.49, UserMood.Serene],
    [0.49, 0.57, UserMood.Energized],
    [0.57, 0.65, UserMood.Happy],
    [0.65, 0.73, UserMood.Hopeful],
    [0.73, 0.81, UserMood.Proud],
    [0.81, 0.89, UserMood.Inspired],
    [0.89, 1, UserMood.Ecstatic]
  ];

  export function matchMood(score: number, magnitude: number): UserMood {
    const moods = MoodMatchingTable;

    if (score === 0 && magnitude > 0) {
      return UserMood.Mixed;
    }

    const mood = _.find(moods, ([start, end]) => {
      return _.inRange(score, start, end);
    });

    return _.get(mood, 2) || UserMood.Unknown;
  }

  export function allTextInUppercase(text: string): boolean {
    return _.every(text, char => char === char.toUpperCase());
  }
}
