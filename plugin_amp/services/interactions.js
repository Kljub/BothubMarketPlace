// Service "interactions": the buttons of the plugin (key "amp") and the
// login modal ("ampl"), plus the login panel and the dropdown lists of the
// settings page.
//   amp  data "login" / "logout"           login panel
//        data "<action>:<instance id>"     buttons under /amp-info
//   ampl fields user, password, code       Core/Login
import { AmpError, instances, login, loginOf, logout, templates } from './amp.js';
import { lang, t } from './i18n.js';
import { backup, findServer, infoMessage, mayManage, power } from './servers.js';

/** An AmpError as text for the member; other errors are thrown on. */
export function errorText(L, err) {
  if (err instanceof AmpError) return `❌ ${t(L, `err.${err.key}`, err.params)}`;
  throw err;
}

/** The login panel: state of the connection with log in / log out. */
export async function panelMessage(ctx) {
  const L = lang(ctx);
  const stored = await loginOf(ctx);
  const state = stored
    ? t(L, 'panel.connected', { name: stored.name, user: stored.username, version: stored.version || '?', mode: t(L, stored.controller ? 'mode.controller' : 'mode.single') })
    : t(L, 'panel.none');
  const buttons = [{ key: 'amp', data: 'login', label: t(L, 'btn.login'), emoji: '🔑', style: 'primary' }];
  if (stored) buttons.push({ key: 'amp', data: 'logout', label: t(L, 'btn.logout'), emoji: '🚪', style: 'secondary' });
  return { embeds: [{ color: '#1e88e5', title: `🎮 ${t(L, 'panel.title')}`, description: `${t(L, 'panel.text')}\n\n${state}` }], components: [buttons] };
}

/** Fills the dropdowns "instances" and "templates" of the settings page. */
export async function refreshOptions(ctx) {
  if (!(await loginOf(ctx))) return;
  const list = await instances(ctx);
  await ctx.config.setOptions('instances', list.slice(0, 200).map((i) => ({ value: i.id, label: `${i.friendly}${i.module ? ` (${i.module})` : ''}`.slice(0, 100) })));
  const stored = await loginOf(ctx);
  if (stored?.controller) {
    const tpl = await templates(ctx).catch(() => []);
    await ctx.config.setOptions('templates', tpl.slice(0, 200).map((x) => ({ value: String(x.id), label: x.name.slice(0, 100) })));
  }
}

const who = (ev) => ({ userId: ev.user.id, guildId: ev.guildId, channelId: ev.channelId });

export const components = {
  async amp(ctx, ev) {
    const L = lang(ctx);
    if (!ev.guildId) return ctx.interaction.reply(ev.handle, t(L, 'err.server'), { ephemeral: true });
    if (!(await mayManage(ctx, who(ev)))) return ctx.interaction.reply(ev.handle, `❌ ${t(L, 'err.access')}`, { ephemeral: true });
    if (ev.data === 'login') {
      const stored = await loginOf(ctx);
      return ctx.interaction.showModal(ev.handle, {
        key: 'ampl',
        title: t(L, 'modal.title'),
        fields: [
          { key: 'user', label: t(L, 'modal.user'), style: 'short', required: true, max: 100, value: stored?.username ?? '' },
          { key: 'password', label: t(L, 'modal.password'), style: 'short', required: true, max: 200 },
          { key: 'code', label: t(L, 'modal.code'), style: 'short', required: false, max: 10 },
        ],
      });
    }
    if (ev.data === 'logout') {
      await logout(ctx);
      return ctx.interaction.update(ev.handle, await panelMessage(ctx));
    }
    const [action, id] = String(ev.data).split(':');
    try {
      const inst = await findServer(ctx, id);
      if (action === 'backup') {
        const title = `Discord ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
        await backup(ctx, inst, title, ev.user.name);
        return ctx.interaction.reply(ev.handle, t(L, 'backup.done', { name: inst.friendly, title }), { ephemeral: true });
      }
      if (action !== 'refresh') {
        await ctx.interaction.deferReply(ev.handle, { ephemeral: true }).catch(() => undefined);
        await power(ctx, inst, action);
        await ctx.interaction.editReply(ev.handle, t(L, `power.${action}`, { name: inst.friendly }));
        return;
      }
      const fresh = await findServer(ctx, id);
      const { message } = await infoMessage(ctx, L, fresh, true);
      return ctx.interaction.update(ev.handle, message);
    } catch (err) {
      const text = errorText(L, err);
      return ctx.interaction.reply(ev.handle, text, { ephemeral: true }).catch(() => ctx.interaction.editReply(ev.handle, text));
    }
  },
};

export const modals = {
  async ampl(ctx, ev) {
    const L = lang(ctx);
    if (!ev.guildId || !(await mayManage(ctx, who(ev)))) return ctx.interaction.reply(ev.handle, `❌ ${t(L, 'err.access')}`, { ephemeral: true });
    const user = String(ev.fields?.user ?? '').trim();
    const password = String(ev.fields?.password ?? '');
    const code = String(ev.fields?.code ?? '').trim();
    try {
      const stored = await login(ctx, user, password, code, ev.user.id);
      await refreshOptions(ctx).catch((err) => ctx.logger.warn(`options: ${err?.message ?? err}`));
      return ctx.interaction.reply(ev.handle, t(L, 'login.done', { name: stored.name, user: stored.username, mode: t(L, stored.controller ? 'mode.controller' : 'mode.single') }), { ephemeral: true });
    } catch (err) {
      return ctx.interaction.reply(ev.handle, errorText(L, err), { ephemeral: true });
    }
  },
};
