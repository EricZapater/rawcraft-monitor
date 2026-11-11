# Especificació del Mòdul: Autenticació i Usuaris (`user` / `auth`)

## Resum de l'Èpica
Permetre l'accés segur al panell web del Punt Central mitjançant autenticació JWT i proporcionar als administradors les eines per gestionar usuaris i assignar a quins servidors té accés cada usuari.

---

## Històries d'Usuari

### HU-USR-01: Inici i tancament de sessió al panell web
**Com a** usuari registrat (`ADMIN` o `USER`),  
**vull** iniciar sessió amb el meu correu electrònic i contrasenya i poder tancar la sessió,  
**per** accedir de forma segura als servidors que tinc autoritzats.

#### Criteris d'acceptació:
1. Qualsevol ruta privada del panell web redirigeix a `/login` si l'usuari no té un token JWT vàlid.
2. En introduir email i contrasenya vàlids d'un usuari actiu, el sistema retorna un token JWT i les dades bàsiques de l'usuari (`id`, `name`, `email`, `role`) i redirigeix al Dashboard principal.
3. Si les credencials són incorrectes o l'usuari està desactivat (`is_active = false` o eliminat amb *soft-delete*), es mostra un missatge d'error genèric (`"Credencials invàlides o compte inactiu"`) amb codi HTTP `401`.
4. En tancar la sessió (Logout), s'elimina el token del client i es redirigeix a `/login`.
5. Al primer arrencament del sistema sense usuaris a la base de dades, es crea automàticament un usuari `ADMIN` inicial a partir de variables d'entorn (`ADMIN_INITIAL_EMAIL`, `ADMIN_INITIAL_PASSWORD`).

---

### HU-USR-02: Llistat i creació d'usuaris (només `ADMIN`)
**Com a** usuari amb rol `ADMIN`,  
**vull** veure el llistat d'usuaris del sistema i donar d'alta nous usuaris (`ADMIN` o `USER`),  
**per** controlar qui pot entrar al Punt Central (sense registre públic obert).

#### Criteris d'acceptació:
1. Només els usuaris amb rol `ADMIN` poden accedir a la vista de gestió d'usuaris i als endpoints d'administració d'usuaris (un rol `USER` rep `403 Forbidden`).
2. El llistat mostra per a cada usuari: nom, email, rol (`ADMIN` o `USER`), estat (`Actiu` / `Inactiu`), nombre o etiquetes dels servidors assignats i data de creació.
3. El formulari d'alta demana: nom, email (únic), contrasenya inicial (mínim 8 caràcters), rol (`ADMIN` o `USER`) i, si el rol és `USER`, la selecció dels servidors als quals tindrà accés.
4. Si l'email ja existeix, el backend retorna `409 Conflict` i la UI mostra l'error al camp corresponent.

---

### HU-USR-03: Edició d'usuari, assignació de servidors i desactivació / baixa (només `ADMIN`)
**Com a** usuari amb rol `ADMIN`,  
**vull** modificar les dades d'un usuari, canviar quins servidors pot veure, restablir-li la contrasenya o desactivar-lo/donar-lo de baixa amb confirmació,  
**per** mantenir els permisos d'accés al dia de forma segura.

#### Criteris d'acceptació:
1. L'`ADMIN` pot modificar el nom, email, rol (`ADMIN` / `USER`), estat (`is_active`), contrasenya (opcional en edició) i la llista de `server_ids` assignats a l'usuari.
2. Quan un usuari amb rol `USER` consulta qualsevol endpoint de servidors, telemetria o alertes, el backend filtra estrictament pels `server_ids` assignats a l'usuari (retornant `403 Forbidden` o `404 Not Found` si intenta accedir per URL/ID a un servidor no autoritzat).
3. Un `ADMIN` no es pot desactivar ni eliminar a si mateix (retorna `400 Bad Request`).
4. Com que l'entitat Usuari és sensible (`product-functional-spec.md`), eliminar un usuari requereix un diàleg de confirmació explícita a la UI i un paràmetre `confirm=true` al backend, aplicant *soft-delete* (`deleted_at`).

---

### HU-USR-04: Canvi de contrasenya pròpia
**Com a** usuari autenticat (`ADMIN` o `USER`),  
**vull** poder canviar la meva pròpia contrasenya indicant l'actual i la nova,  
**per** mantenir la seguretat del meu compte.

#### Criteris d'acceptació:
1. L'usuari ha d'introduir la contrasenya actual correcta i la nova contrasenya (mínim 8 caràcters).
2. Si la contrasenya actual no coincideix, retorna `400 Bad Request` amb missatge clar.
