export const slugify = (text) =>
  text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function titleCase(str) {
  return str.split(' ').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function shout(message) {
  return message.toUpperCase() + '!!!';
}

export function love() {
  return 'You found me. I was here all along.';
}
